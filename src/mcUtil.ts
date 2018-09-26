
// https://italonascimento.github.io/applying-a-timeout-to-your-promises/
export const runPromiseWithTimeout = function(timeoutMs: number, promise: Promise<any>): Promise<any> {
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(`Timed out after ${timeoutMs}ms`);
        }, timeoutMs);
    });

    return Promise.race([ promise, timeout ]);
};