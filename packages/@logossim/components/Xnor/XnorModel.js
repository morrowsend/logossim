import { BaseModel } from '@logossim/core';

export default class XnorModel extends BaseModel {
  initialize(configurations) {
    this.behavior = configurations.MULTIPLE_INPUT_BEHAVIOR;
    this.bits = Number(configurations.DATA_BITS);

    const INPUT_PORTS_NUMBER = Number(
      configurations.INPUT_PORTS_NUMBER,
    );

    for (let i = 0; i < INPUT_PORTS_NUMBER; i += 1) {
      this.addInputPort(`in${i}`, this.bits);
    }
    this.addOutputPort('out', this.bits);
  }

  notExclusiveOrAt(values, index) {
    const mask = 0b1 << index;

    const sum = values
      .map(value => ((value & mask) > 0 ? 1 : 0))
      .reduce((acc, curr) => acc + curr);

    return sum === 1 ? 0 : 1;
  }

  step(input) {
    const MAX_VALUE = 0b1111_1111_1111_1111_1111_1111_1111_1111;
    const mask = MAX_VALUE >>> (32 - this.bits);

    const values = Object.values(input);

    switch (this.behavior) {
      case 'ONE':
        return {
          out: parseInt(
            [...new Array(this.bits)]
              .map((_, index) => this.notExclusiveOrAt(values, index))
              .reverse()
              .join(''),
            2,
          ),
        };
      case 'ODD': {
        const xor = values.reduce((acc, curr) => curr ^ acc);
        return {
          out: ~xor & mask,
        };
      }
      default:
        return {};
    }
  }
}
