import { Point } from '@projectstorm/geometry';
import {
  Action,
  InputType,
  BasePositionModel,
  AbstractDisplacementState,
} from '@projectstorm/react-canvas-core';
import { NodeModel } from '@projectstorm/react-diagrams-core';

import { snap, samePosition, closestPointOnSegment } from './common';

export default class MoveItemsState extends AbstractDisplacementState {
  constructor() {
    super({
      name: 'move-items',
    });

    this.registerAction(
      new Action({
        type: InputType.MOUSE_DOWN,
        fire: event => {
          this.lastDisplacement = new Point(0, 0);

          const element = this.engine
            .getActionEventBus()
            .getModelForEvent(event);

          if (!element.isSelected()) {
            this.engine.getModel().clearSelection();
          }

          this.linkDirections = this.getLinkDirections(element);

          element.setSelected(true);
          this.engine.repaintCanvas();
        },
      }),
    );
  }

  getLinksFromNode(node) {
    if (!(node instanceof NodeModel)) return [];

    return Object.values(node.getPorts())
      .map(p => Object.entries(p.getLinks()))
      .filter(entry => entry.length > 0)
      .flat()
      .map(([id, link]) => [
        [id, link],
        ...this.getBifurcatedLinks(link),
      ])
      .flat();
  }

  getBifurcatedLinks(link) {
    return link
      .getBifurcations()
      .map(b => [[b.getID(), b], ...this.getBifurcatedLinks(b)])
      .flat();
  }

  getLinkDirections(node) {
    return this.getLinksFromNode(node).reduce(
      (acc, [id, link]) => ({
        ...acc,
        [id]: this.getLinkDirection(link),
      }),
      {},
    );
  }

  getLinkDirection(link) {
    const points = link.getPoints();
    if (points.length !== 3) {
      return null;
    }

    const first = link.getFirstPoint().getPosition();
    const middle = points[1].getPosition();

    if (first.x === middle.x) return 'vertical';
    if (first.y === middle.y) return 'horizontal';
    return null;
  }

  activated(previous) {
    super.activated(previous);
    this.initialPositions = {};
  }

  fireMouseMoved(event) {
    const currentDisplacement = snap(
      new Point(
        event.virtualDisplacementX,
        event.virtualDisplacementY,
      ),
      this.engine.getModel().getOptions().gridSize,
    );

    if (samePosition(currentDisplacement, this.lastDisplacement)) {
      return;
    }
    this.lastDisplacement = currentDisplacement;

    this.engine
      .getModel()
      .getSelectedEntities()
      .forEach(entity => {
        if (entity instanceof BasePositionModel) {
          this.moveEntity(entity, event);

          if (entity instanceof NodeModel) {
            this.adjustNodeLinks(entity);
          }
        }
      });

    this.engine.repaintCanvas();
  }

  moveEntity(entity, event) {
    if (entity.isLocked()) {
      return;
    }

    if (!this.initialPositions[entity.getID()]) {
      this.initialPositions[entity.getID()] = {
        point: entity.getPosition(),
        item: entity,
      };
    }

    const initial = this.initialPositions[entity.getID()].point;
    const model = this.engine.getModel();

    entity.setPosition(
      model.getGridPosition(initial.x + event.virtualDisplacementX),
      model.getGridPosition(initial.y + event.virtualDisplacementY),
    );
  }

  adjustNodeLinks(node) {
    Object.values(node.getPorts()).forEach(port =>
      Object.values(port.getLinks()).forEach(this.adjustLinkPoints),
    );
  }

  adjustLinkPoints = link => {
    const points = link.getPoints();

    const first = link.getFirstPoint().getPosition();
    const last = link.getLastPoint().getPosition();

    if (
      points.length === 2 &&
      first.x !== last.x &&
      first.y !== last.y
    ) {
      link.addPoint(link.generatePoint(first.x, last.y), 1);
    } else if (points.length === 3) {
      const middlePoint = points[1];

      const linkDirection = this.linkDirections[link.getID()];

      if (linkDirection === 'horizontal') {
        middlePoint.setPosition(last.x, first.y);
      } else {
        middlePoint.setPosition(first.x, last.y);
      }

      const middle = middlePoint.getPosition();

      if (samePosition(first, middle) || samePosition(middle, last)) {
        link.removePoint(middlePoint);
      }
    }

    // Adjusts the origin position from bifurcations of this link
    this.adjustLinkBifurcations(link);
  };

  adjustLinkBifurcations(link) {
    const bifurcations = link.getBifurcations();

    const points = {
      first: link.getFirstPoint().getPosition(),
      middle:
        link.getPoints().length === 3
          ? link.getPoints()[1].getPosition()
          : null,
      last: link.getLastPoint().getPosition(),
    };

    bifurcations.forEach(bifurcation => {
      const originPoint = bifurcation.getFirstPoint();

      this.adjustBifurcationOrigin(originPoint, points);

      // Adjusts the points of this bifurcation
      this.adjustLinkPoints(bifurcation);
    });
  }

  adjustBifurcationOrigin(originPoint, points) {
    const { first, middle, last } = points;

    const origin = originPoint.getPosition();
    const { gridSize } = this.engine.getModel().getOptions();

    if (middle === null) {
      const closest = snap(
        closestPointOnSegment(origin, {
          A: first,
          B: last,
        }).point,
        gridSize,
      );
      originPoint.setPosition(closest.x, closest.y);
    } else {
      const firstSegment = closestPointOnSegment(origin, {
        A: first,
        B: middle,
      });

      const lastSegment = closestPointOnSegment(origin, {
        A: middle,
        B: last,
      });

      if (firstSegment.distance <= lastSegment.distance) {
        const closest = snap(firstSegment.point, gridSize);
        originPoint.setPosition(closest.x, closest.y);
      } else {
        const closest = snap(lastSegment.point, gridSize);
        originPoint.setPosition(closest.x, closest.y);
      }
    }
  }
}
