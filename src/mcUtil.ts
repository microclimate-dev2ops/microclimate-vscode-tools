import * as path from 'path';

// https://italonascimento.github.io/applying-a-timeout-to-your-promises/
export function runPromiseWithTimeout(timeoutMs: number, promise: Promise<any>): Promise<any> {
    const timeout = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
            clearTimeout(id);
            reject(`Timed out after ${timeoutMs}ms`);
        }, timeoutMs);
    });

    return Promise.race([ promise, timeout ]);
}

/**
 * Append toAppend to start, removing the last segment of start if the first segment of toAppend matches it.
 * 
 * appendPathWithoutDupe("/home/tim/microclimate-workspace/", "/microclimate-workspace/myproject") 
 *      -> "/home/tim/microclimate-workspace/myproject"
 */
export function appendPathWithoutDupe(start: string, toAppend: string): string {
    // Remove end of start / if present
    if (start.endsWith(path.sep)) {
        start = start.substring(0, start.length);
    }

    // Remove start of toAppend / if present
    if (toAppend.startsWith(path.sep)) {
        toAppend = toAppend.substring(1, toAppend.length + 1);
    }

    const lastStartSegment = lastPathSegment(start);
    if (toAppend.startsWith(lastStartSegment)) {
        start = start.substring(0, start.length - lastStartSegment.length);
    }
    
    return path.join(start, toAppend);
}

/**
 * Returns the last segment of the given path, with no starting slash. 
 * Trailing slash is kept if present.
 * 
 * lastPathSegment("/home/tim/test/dir/") -> "dir/"
 */
export function lastPathSegment(p: string): string {
    return p.substr(p.lastIndexOf(path.sep) + 1);
}