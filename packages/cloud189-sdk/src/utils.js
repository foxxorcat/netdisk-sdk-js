import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";
/**
 * 处理axios-cookiejar-support代理问题
 * 
 * `https://github.com/3846masa/axios-cookiejar-support/issues/669`
 * @param {HttpCookieAgent|HttpsCookieAgent} AgentClass 
 */
const wrapAgent = (AgentClass) => {
    const kProxy = Symbol('kProxy')
    class WrappedAgent extends AgentClass {
        constructor(options) {
            super(options)
            if (options && options.cookies)
                this[kProxy] = options.cookies.proxy
        }

        addRequest(req, options) {
            const protocol = req.protocol
            const host = req.host
            const path = req.path
            if (this[kProxy]) {
                const parsed = URL.parse(req.path)
                req.protocol = parsed.protocol
                req.host = parsed.host
                req.path = parsed.pathname + (parsed.search ? parsed.search : '')
            }
            const result = super.addRequest(req, options)
            if (this[kProxy]) {
                req.protocol = protocol
                req.host = host
                req.path = path
            }
            return result
        }
    }
    return WrappedAgent
}

export { wrapAgent }