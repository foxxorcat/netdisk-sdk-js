export namespace Check {
    export const isString = (v: any): v is string => typeof v === 'string'
    export const isNumber = (v: any): v is boolean => typeof v === 'number'
    export const isObject = (v: any): v is object => typeof v === 'object'
    export const isArray = (v: any): v is any[] => Array.isArray(v)

    export const isUint8Array = (v: any): v is Uint8Array => v && v instanceof Uint8Array
}
