import { Check } from "./is"

export namespace ArrayUtil {
    export const arrayLengthCount = (...arrs: any[]) => {
        let length = 0
        for (const arr of arrs) {
            if (Check.isArray(arr)) length += arr.length
        }
        return length
    }
}