// Worker script: worker.js

let isReady = false;
let moduleLoaded = false;
let initializationPromise = null;

function loadWasmModule(domain) {
    if (initializationPromise) return initializationPromise;
    
    initializationPromise = new Promise((resolve, reject) => {
        try {
            self.Module = {
                onRuntimeInitialized: () => {
                    isReady = true;
                    postMessage({type: 'ready'});
                    resolve();
                }
            };
            
            if (domain === 'complex') {
                importScripts('vsearch_complex.js');
            } else {
                importScripts('vsearch.js');
            }
            
            // In case WASM was already synchronously initialized during importScripts
            if (self.Module.calledRun) {
                isReady = true;
                postMessage({type: 'ready'});
                resolve();
            }
        } catch (e) {
            console.error("Failed to load WASM module", e);
            reject(e);
        }
    });
    
    return initializationPromise;
}

function allocateDoubleArray(arr) {
    const ptr = Module._malloc(arr.length * 8);
    const heapF64 = Module.HEAPF64 || (typeof HEAPF64 !== 'undefined' ? HEAPF64 : null);
    if (!heapF64) {
        throw new Error('WASM HEAPF64 view is not available');
    }
    heapF64.set(arr, ptr / 8);
    return ptr;
}

function parseRealToken(value) {
    const str = String(value || '')
        .trim()
        .replace(/\u2212/g, '-')
        .replace(/\u03c0/gi, 'pi')
        .replace(/\u03c6/gi, 'phi')
        .toLowerCase();

    if (str === 'pi' || str === 'p') return Math.PI;
    if (str === 'e') return Math.E;
    if (str === 'phi' || str === 'goldenratio') return (1 + Math.sqrt(5)) / 2;

    return parseFloat(str);
}

function parseImaginaryToken(value) {
    if (value === '' || value === '+') return 1;
    if (value === '-') return -1;
    return parseRealToken(value);
}

function splitComplexCore(core) {
    for (let j = core.length - 1; j > 0; j--) {
        if ((core[j] === '+' || core[j] === '-') && core[j - 1] !== 'e') {
            return j;
        }
    }
    return -1;
}

function parseComplexInput(value) {
    const str = String(value || '')
        .replace(/\s/g, '')
        .replace(/\u2212/g, '-')
        .replace(/\u03c0/gi, 'pi')
        .replace(/\u03c6/gi, 'phi')
        .toLowerCase();

    if (str === 'i' || str === '+i') return { r: 0, i: 1 };
    if (str === '-i') return { r: 0, i: -1 };

    if (str.endsWith('i')) {
        const core = str.slice(0, -1);
        const splitIdx = splitComplexCore(core);

        if (splitIdx !== -1) {
            const r = parseRealToken(core.slice(0, splitIdx));
            const i = parseImaginaryToken(core.slice(splitIdx));
            return { r: isNaN(r) ? 0 : r, i: isNaN(i) ? 0 : i };
        }

        const i = parseImaginaryToken(core);
        return { r: 0, i: isNaN(i) ? 0 : i };
    }

    const r = parseRealToken(str);
    return { r: isNaN(r) ? 0 : r, i: 0 };
}

function doWork(initDelay, z, targetValue, inputValue, recognitionTarget, calculatorMode, calculatorSpec, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus, earlyExitCRThreshold, domain) {
    return new Promise(resolve => {
        setTimeout(() => {
            try {
                if (recognitionTarget === 'function' || recognitionTarget === 'sequence') {
                    const pairs = inputValue.split(/[\n;]/).map(p => p.trim()).filter(p => p);
                    const x_real = []; const x_imag = [];
                    const y_real = []; const y_imag = [];

                    if (recognitionTarget === 'sequence') {
                        const values = inputValue.split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
                        values.forEach((value, index) => {
                            x_real.push(index + 1);
                            x_imag.push(0);
                            if (domain === 'complex') {
                                const parsed = parseComplexInput(value);
                                y_real.push(parsed.r); y_imag.push(parsed.i);
                            } else {
                                y_real.push(parseRealToken(value));
                            }
                        });
                    } else {
                        pairs.forEach(p => {
                            const separator = p.includes(':') ? ':' : ',';
                            const parts = p.split(separator);
                            if (parts.length >= 2) {
                                if (domain === 'complex') {
                                    const px = parseComplexInput(parts[0]);
                                    const py = parseComplexInput(parts[1]);
                                    x_real.push(px.r); x_imag.push(px.i);
                                    y_real.push(py.r); y_imag.push(py.i);
                                } else {
                                    x_real.push(parseRealToken(parts[0]));
                                    y_real.push(parseRealToken(parts[1]));
                                }
                            }
                        });
                    }
                    
                    if (x_real.length > 0) {
                        if (domain === 'complex') {
                            const xr_ptr = allocateDoubleArray(x_real); const xi_ptr = allocateDoubleArray(x_imag);
                            const yr_ptr = allocateDoubleArray(y_real); const yi_ptr = allocateDoubleArray(y_imag);
                            const result = Module.ccall('search_function_wasm', 'string',
                                ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                [xr_ptr, xi_ptr, yr_ptr, yi_ptr, 0, x_real.length, MinCodeLength, MaxCodeLength, cpuId, ncpus]);
                            Module._free(xr_ptr); Module._free(xi_ptr); Module._free(yr_ptr); Module._free(yi_ptr);
                            resolve(JSON.parse(result));
                            return;
                        } else {
                            const x_ptr = allocateDoubleArray(x_real);
                            const y_ptr = allocateDoubleArray(y_real);
                            const result = Module.ccall('search_function_wasm', 'string',
                                ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                [x_ptr, y_ptr, 0, x_real.length, MinCodeLength, MaxCodeLength, cpuId, ncpus]);
                            Module._free(x_ptr);
                            Module._free(y_ptr);
                            resolve(JSON.parse(result));
                            return;
                        }
                    }
                } else if (recognitionTarget === 'multiple') {
                    let values = [];
                    if (domain === 'complex') {
                        values = inputValue.split(/[,;\n]/).map(v => v.trim()).filter(Boolean).map(parseComplexInput);
                    } else {
                        values = inputValue.split(/[,;\n]/).map(v => parseRealToken(v.trim())).filter(v => !isNaN(v));
                    }
                    
                    if (values.length > 0) {
                        if (domain === 'complex') {
                            const xr_arr = new Array(values.length).fill(0);
                            const xi_arr = new Array(values.length).fill(0);
                            const yr_arr = values.map(v => v.r);
                            const yi_arr = values.map(v => v.i);
                            const xr_ptr = allocateDoubleArray(xr_arr); const xi_ptr = allocateDoubleArray(xi_arr);
                            const yr_ptr = allocateDoubleArray(yr_arr); const yi_ptr = allocateDoubleArray(yi_arr);
                            const result = Module.ccall('search_batch_wasm', 'string',
                                ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                [xr_ptr, xi_ptr, yr_ptr, yi_ptr, 0, values.length, MinCodeLength, MaxCodeLength, cpuId, ncpus]);
                            Module._free(xr_ptr); Module._free(xi_ptr); Module._free(yr_ptr); Module._free(yi_ptr);
                            resolve(JSON.parse(result));
                            return;
                        } else {
                            const x_arr = new Array(values.length).fill(0);
                            const x_ptr = allocateDoubleArray(x_arr);
                            const y_ptr = allocateDoubleArray(values);
                            const result = Module.ccall('search_batch_wasm', 'string',
                                ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                [x_ptr, y_ptr, 0, values.length, MinCodeLength, MaxCodeLength, cpuId, ncpus]);
                            Module._free(x_ptr);
                            Module._free(y_ptr);
                            resolve(JSON.parse(result));
                            return;
                        }
                    }
                }
                
                let z_real = 0, z_imag = 0;
                if (domain === 'complex') {
                    if (targetValue && Number.isFinite(targetValue.real) && Number.isFinite(targetValue.imag)) {
                        z_real = targetValue.real;
                        z_imag = targetValue.imag;
                    } else {
                        const parsed = parseComplexInput(inputValue);
                        z_real = parsed.r;
                        z_imag = parsed.i;
                    }
                } else {
                    z_real = targetValue && Number.isFinite(targetValue.real) ? targetValue.real : parseRealToken(z);
                }

                if (calculatorMode === 'list' || calculatorMode === 'custom' || calculatorMode === 'fire_everything') {
                    const constList = (calculatorSpec?.consts || []).join(',');
                    const funcList = (calculatorSpec?.funcs || []).join(',');
                    const opList = (calculatorSpec?.ops || []).join(',');
                    if (domain === 'complex') {
                        const result = Module.ccall('search_RPN_custom', 'string',
                            ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'string', 'string'],
                            [z_real, z_imag, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus, constList, funcList, opList]);
                        resolve(JSON.parse(result));
                    } else {
                        const result = Module.ccall('search_RPN_custom', 'string',
                            ['number', 'number', 'number', 'number', 'number', 'number', 'string', 'string', 'string'],
                            [z_real, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus, constList, funcList, opList]);
                        resolve(JSON.parse(result));
                    }
                    return;
                }

                if (domain === 'complex') {
                    if (typeof Module._search_RPN_with_cr === 'function') {
                        const result = Module.ccall('search_RPN_with_cr', 'string',
                                       ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                       [z_real, z_imag, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus, earlyExitCRThreshold]);
                        resolve(JSON.parse(result));
                        return;
                    }

                    const result = Module.ccall('search_RPN', 'string',
                                   ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                   [z_real, z_imag, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus]);
                    resolve(JSON.parse(result));
                } else {
                    if (typeof Module._search_RPN_with_cr === 'function') {
                        const result = Module.ccall('search_RPN_with_cr', 'string',
                                       ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
                                       [z_real, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus, earlyExitCRThreshold]);
                        resolve(JSON.parse(result));
                        return;
                    }

                    const result = Module.ccall('search_RPN', 'string',
                                   ['number', 'number', 'number', 'number', 'number', 'number'],
                                   [z_real, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus]);
                    resolve(JSON.parse(result));
                }
            } catch (err) {
                console.error('WASM call error:', err);
                resolve({ results: [], error: err.message });
            }
        }, initDelay);
    });
}

onmessage = async function(e) {
    const {
        initDelay = 0,
        z,
        targetValue,
        inputValue,
        recognitionTarget,
        calculatorMode,
        calculatorSpec,
        inputPrecision,
        MinCodeLength,
        MaxCodeLength,
        cpuId,
        ncpus,
        earlyExitCRThreshold = 0.9,
        domain = 'real'
    } = e.data;
    
    await loadWasmModule(domain);
    
    console.log(`Worker ${cpuId} of ${ncpus} starting work for z=${z}, Target=${recognitionTarget}, Mode=${calculatorMode}, Domain=${domain}`);
    
    const resultJSON = await doWork(initDelay, z, targetValue, inputValue, recognitionTarget, calculatorMode, calculatorSpec, inputPrecision, MinCodeLength, MaxCodeLength, cpuId, ncpus, earlyExitCRThreshold, domain);
    
    console.log(`Worker ${cpuId} finished work with result:`, resultJSON);
    
    postMessage({
        cpuId,
        ...resultJSON
    });
};
