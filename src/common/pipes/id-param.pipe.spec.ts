import { BadRequestException } from '@nestjs/common';
import { IdParamPipe } from './id-param.pipe';

describe('IdParamPipe', () => {
  const pipe = new IdParamPipe();

  it.each(['1', '42', '900719925474099300'])('accepts %s', (id) => {
    expect(pipe.transform(id)).toBe(id);
  });

  it.each(['', '0x1', '-1', '1.5', 'abc', '1 OR 1=1', '1'.repeat(19)])(
    'rejects "%s" with 400',
    (id) => {
      expect(() => pipe.transform(id)).toThrow(BadRequestException);
    },
  );
});
