export class AssertionError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export const assert = (condition: boolean, message: string) => {
    if (!condition) {
        console.error(message);
        throw new AssertionError(message);
    }
};
