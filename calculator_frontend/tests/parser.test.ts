import { describe, it, expect } from 'vitest';

// We extract the parsing logic that is used in worker.js and page.tsx 
// into an easily testable format.
function parseFunctionInput(inputValue) {
    const pairs = inputValue.split(/[\n;]/).map(p => p.trim()).filter(p => p);
    const x_arr = [];
    const y_arr = [];
    pairs.forEach(p => {
        const parts = p.split(/[:,]/);
        if (parts.length >= 2) {
            x_arr.push(parseFloat(parts[0]));
            y_arr.push(parseFloat(parts[1]));
        }
    });
    return { x_arr, y_arr };
}

function parseMultipleConstants(inputValue) {
    return inputValue.split(/[,;\n]/).map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
}

describe('Frontend Input Parsing Logic', () => {
  
  describe('parseFunctionInput (MODE_FUNCTION)', () => {
    it('should parse semi-colon separated pairs', () => {
      const input = "1:1; 2:4; 3:9";
      const { x_arr, y_arr } = parseFunctionInput(input);
      expect(x_arr).toEqual([1, 2, 3]);
      expect(y_arr).toEqual([1, 4, 9]);
    });

    it('should parse newline separated comma pairs', () => {
      const input = `
        1,1
        2,4
        3,9
      `;
      const { x_arr, y_arr } = parseFunctionInput(input);
      expect(x_arr).toEqual([1, 2, 3]);
      expect(y_arr).toEqual([1, 4, 9]);
    });

    it('should ignore invalid pairs', () => {
      const input = "1:1; invalid; 3:9";
      const { x_arr, y_arr } = parseFunctionInput(input);
      expect(x_arr).toEqual([1, 3]);
      expect(y_arr).toEqual([1, 9]);
    });
  });

  describe('parseMultipleConstants (MODE_BATCH)', () => {
    it('should parse comma-separated constants', () => {
      const input = "3.14159, 2.71828, 1.61803";
      const vals = parseMultipleConstants(input);
      expect(vals).toEqual([3.14159, 2.71828, 1.61803]);
    });

    it('should parse newline and semicolon-separated constants', () => {
      const input = "3.14159; \n 2.71828; \n 1.61803";
      const vals = parseMultipleConstants(input);
      expect(vals).toEqual([3.14159, 2.71828, 1.61803]);
    });

    it('should ignore NaN values', () => {
      const input = "3.14159, abc, 2.71828";
      const vals = parseMultipleConstants(input);
      expect(vals).toEqual([3.14159, 2.71828]);
    });
  });

const parseComplex = (str) => {
    str = str.replace(/\s/g, '').toLowerCase();
    let r = 0, i = 0;
    if (str.endsWith('i')) {
        const core = str.slice(0, -1);
        if (core === '' || core === '+') { r = 0; i = 1; }
        else if (core === '-') { r = 0; i = -1; }
        else {
            let splitIdx = -1;
            for (let j = core.length - 1; j > 0; j--) {
                if ((core[j] === '+' || core[j] === '-') && core[j-1] !== 'e') {
                    splitIdx = j;
                    break;
                }
            }
            if (splitIdx !== -1) {
                const rStr = core.slice(0, splitIdx);
                let iStr = core.slice(splitIdx);
                r = parseFloat(rStr);
                if (iStr === '+' || iStr === '-') iStr += '1';
                i = parseFloat(iStr);
            } else {
                r = 0;
                i = parseFloat(core);
            }
        }
    } else {
        r = parseFloat(str);
        i = 0;
    }
    return { r: isNaN(r) ? 0 : r, i: isNaN(i) ? 0 : i };
};

describe('Complex Parsing Logic', () => {
  it('should parse real numbers', () => {
    expect(parseComplex("3.14")).toEqual({ r: 3.14, i: 0 });
    expect(parseComplex("-2.5")).toEqual({ r: -2.5, i: 0 });
  });
  
  it('should parse pure imaginary numbers', () => {
    expect(parseComplex("3i")).toEqual({ r: 0, i: 3 });
    expect(parseComplex("-2.5i")).toEqual({ r: 0, i: -2.5 });
  });

  it('should parse complex numbers', () => {
    expect(parseComplex("3.14+2i")).toEqual({ r: 3.14, i: 2 });
    expect(parseComplex("-2.5-1.5i")).toEqual({ r: -2.5, i: -1.5 });
    expect(parseComplex("1+i")).toEqual({ r: 1, i: 1 });
    expect(parseComplex("1-i")).toEqual({ r: 1, i: -1 });
  });
});
});
