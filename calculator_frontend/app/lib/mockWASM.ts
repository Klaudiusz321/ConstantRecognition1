type WASMArgument = string | number | boolean | null;

export const mockWASMModule = {
  ccall: (name: string, _returnType: string, _argTypes: string[], args: WASMArgument[]) => {
    console.log('[WASM] Mock call:', { name, args });

    if (name === 'search_RPN') {
      const cpuId = Number(args[4] ?? 0);

      return JSON.stringify({
        RPN: 'PI, TWO, SQRT, PLUS',
        Mathematica: '(Pi + Sqrt[2])',
        Error: 1.23e-10,
        cpuId,
        results: [],
      });
    }

    return '{}';
  },
};

export function createMockWASM() {
  return new Promise<typeof mockWASMModule>((resolve) => {
    setTimeout(() => {
      resolve(mockWASMModule);
    }, 500);
  });
}
