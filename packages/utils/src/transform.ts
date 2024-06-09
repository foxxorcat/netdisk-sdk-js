import { Check } from "./is";

export namespace Transform {
    export const toArray = <T>(arr: T | T[]): T[] => {
        return Check.isArray(arr) ? arr : [arr]
    }
}