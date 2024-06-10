import superagent, { Agent, Response, Request } from "superagent";
import errcode from "err-code";
import { Await, Check, ContentType, Transform } from '@netdisk-sdk/utils'

import { AccountType, ApiURL, AppID, AuthURL, ClientType, ReturnURL, UserAgent, WebURL, clientSuffix } from "./const";
import { IAppSession, IAppToken, IEncryptConf, ILoginOptionCommon, ILoginParam } from "./types";
import { aseEncrypt, formatDate, getJSONParse, isICloud189ApiResult, isICloud189AuthApiResult, rsaEncrypt, signatureV2, sleep, timestamp } from "./helper";
import { Cloud189SharedFSApi } from "./sharefs_api";

export class Cloud189Client {
    agent: Agent
    source: ITokenSessionSource
    shareApi: Cloud189SharedFSApi

    constructor(source: ITokenSessionSource, agent?: Agent) {
        this.source = source

        this.agent = agent ?? superagent.agent()
            .accept(ContentType.JSON)
            .set('User-Agent', UserAgent)
            .ok((resp: Response) => {
                if (resp.status >= 400) return false

                const body = resp.body
                if (isICloud189AuthApiResult(body)) {
                    if (body.result != 0)
                        throw errcode(new Error('auth api error'), body.msg, { detail: body })
                } else if (isICloud189ApiResult(body)) {
                    switch (body.res_code) {
                        case 0: return true
                        case 'InvalidSessionKey':
                            this.source.refreshSession?.(); break
                        case 'UserInvalidOpenToken':
                        case 'InvalidAccessToken':
                            this.source.refreshToken?.(); break
                        default:
                            throw errcode(new Error('api error'), body.res_message, { detail: body })
                    }
                }
                return true
            })
            .use((req: Request) => {
                const _originalEnd = req.end;
                req.end = async (callback) => {
                    const url = req.url
                    if (url.includes(ApiURL)) {
                        const { sessionKey, sessionSecret, familySessionKey, familySessionSecret } = await this.source.session()

                        // @ts-ignore
                        const query = new URLSearchParams(req.qs);
                        const params = aseEncrypt(sessionSecret.slice(0, 16), query.toString())
                        // @ts-ignore
                        req.qs = { params }

                        const method = req.method.toUpperCase()
                        const session = url.includes('/family') ? { sessionKey: familySessionKey, sessionSecret: familySessionSecret } : { sessionKey, sessionSecret }
                        const header = signatureV2(method, url, params, session)
                        req.set(header)
                    } else if (url.includes(WebURL)) {
                        const { sessionKey } = await this.source.session()
                        req.query({ sessionKey })
                    }

                    req.end = _originalEnd
                    return req.end(callback)
                }
            })
            .retry(3)
        this.shareApi = new Cloud189SharedFSApi(this)
    }
}

export class Cloud189AuthClient {
    agent: Agent
    encryptConf?: IEncryptConf;

    constructor(agent?: Agent) {
        this.agent = agent ?? superagent.agent()
            .accept(ContentType.JSON)
            .set('User-Agent', UserAgent)
            .ok((resp: Response) => {
                if (resp.status >= 400) return false
                if (isICloud189AuthApiResult(resp.body)) {
                    if (resp.body.result != 0)
                        throw errcode(new Error('auth api error'), resp.body.msg, { detail: resp.body })
                } else if (isICloud189ApiResult(resp.body)) {
                    // res_code == UserInvalidOpenToken accessToken失效
                    if (resp.body.res_code != 0)
                        throw errcode(new Error('api error'), resp.body.res_message, { detail: resp.body })
                }
                return true
            })
    }

    /**
     * @param refreshToken 
     * @returns 
     */
    async loginByRefreshToken(refreshToken: string): Promise<IAppToken & IAppSession> {
        const appToken = await this.refreshToken(refreshToken)
        const session = await this.getSessionForPC({ accessToken: appToken.accessToken })
        return { ...appToken, ...session }
    }

    /**
     * 使用账户密码登录
     * @param loginParam 通过getLoginParam获取
     * @param username 未加密用户名
     * @param password 未加密密码
     * @param options 
     * @returns 
     */
    async loginByPassword(loginParam: ILoginParam, username: string, password: string, options: Partial<ILoginOptionCommon> = {}): Promise<IAppToken & IAppSession> {
        delete options['signal']

        const rsaUsername = await this.encryptData(username)
        const rsaPassword = await this.encryptData(password)

        const { paramID, reqID, lt, captchaToken } = loginParam

        const { body: result } = await this.agent
            .post(`${AuthURL}/api/logbox/oauth2/loginSubmit.do`)
            .type(ContentType.FormUrlencoded)
            .set({
                Referer: AuthURL,
                Reqid: reqID,
                lt: lt,
            })
            .send({
                appKey: AppID,
                accountType: AccountType,
                userName: rsaUsername,
                password: rsaPassword,
                clientType: ClientType,
                returnUrl: ReturnURL,

                cb_SaveName: "3",

                validateCode: "",
                // smsValidateCode:"",
                captchaToken: captchaToken,
                paramId: paramID,

                // mailSuffix:   "@189.cn",
                dynamicCheck: "FALSE",

                isOauth2: "false",
                state: "",
                ...options
            })
        return await this.getSessionForPC({ redirectURL: result.toUrl })
    }

    /**
     * 根据cookie登录
     * 
     * @param cookies 
     */
    async loginByCookies(cookies: string) {
        if (!/SSON=([0-9a-z]*)/gi.test(cookies)) throw new Error('Cookies need key SSON')

        const resp1 = await this.agent
            .get(`${WebURL}/api/portal/unifyLoginForPC.action`)
            .query({
                appId: AppID,
                clientType: ClientType,
                returnURL: ReturnURL,
                timeStamp: timestamp(),
            })
            .redirects(0)
        const location = resp1.headers['location']

        const resp2 = await this.agent
            .get(location)
            .set('Cookie', cookies)
            .redirects(0)
        const redirectURL = resp2.headers['location']

        if (redirectURL == null) throw new Error('login failed,No redirectURL obtained')
        return await this.getSessionForPC({ redirectURL })
    }

    /**
     * 二维码扫描登录
     */
    async loginByQR(loginParam: ILoginParam, showImage: (image: Uint8Array) => void, options: Partial<ILoginOptionCommon> = {}): Promise<IAppToken & IAppSession> {
        const { paramID, reqID, lt } = loginParam
        const signal = options.signal
        delete options['signal']

        interface IUUIDResult {
            encodeuuid: string
            encryuuid: string
            uuid: string
        }

        const { body: { uuid, encodeuuid, encryuuid } } = await this.agent
            .post(`${AuthURL}/api/logbox/oauth2/getUUID.do`)
            .type(ContentType.FormUrlencoded)
            .buffer(true).parse(getJSONParse())
            .send({ appId: AppID })

        // 下载验证码
        const { body: image } = await this.agent
            .get(`${AuthURL}/api/logbox/oauth2/image.do`)
            .query({ uuid: encodeuuid, REQID: reqID })
            .responseType('arraybuffer')

        showImage(image)

        /**
         * 判断二维码状态
         */
        while (true) {
            signal?.throwIfAborted()

            interface IState {
                status: number
                redirectUrl: string
            }
            const timeStamp = timestamp()
            const date = formatDate(new Date(timeStamp))

            const { body: { status, redirectUrl } } = await this.agent
                .post(`${AuthURL}/api/logbox/oauth2/qrcodeLoginState.do`)
                .type(ContentType.FormUrlencoded)
                .set({
                    Referer: AuthURL,
                    Reqid: reqID,
                    lt: lt,
                })
                .buffer(true).parse(getJSONParse())
                .send({
                    appId: AppID,
                    clientType: ClientType,
                    returnUrl: ReturnURL,
                    paramId: paramID,

                    uuid,
                    encryuuid,
                    date,
                    timeStamp: timeStamp,
                    cb_SaveName: 0,
                    isOauth2: false,
                    state: '',
                    ...options
                })

            switch (status) {
                case 0:
                    return await this.getSessionForPC({ redirectURL: redirectUrl })
                case -11001:// 过期
                    throw new Error('QR code expired')
                case -106: // 等待扫描
                case -11002://等待确认
                    await sleep(1000)
                    continue
                default:
                    throw errcode(new Error(`QR code unknown error`), { detail: status })
            }
        }
    }

    getSessionForPC(param: { redirectURL: string }): Promise<IAppSession & IAppToken>;
    /**
     * 刷新会话token
     * @param param 
     */
    getSessionForPC(param: { accessToken: string }): Promise<IAppSession>;
    async getSessionForPC({ redirectURL, accessToken }: any) {
        if (redirectURL == null && accessToken == null) throw new Error('params is null')
        const params = redirectURL != null ? { redirectURL } : { accessToken, appId: AppID }

        const { body: result } = await this.agent
            .query({
                appId: AppID,
                ...clientSuffix(),
                ...params
            })
            .post(`${ApiURL}/getSessionForPC.action`)

        result.expiry = new Date(Date.now() + 8640 * 1000).getTime()
        return result
    }

    /**
     * 刷新token
     * 
     * docs: https://id.189.cn/html/api_detail_493.html
     * @param refreshToken 
     */
    async refreshToken(refreshToken: string): Promise<IAppToken> {
        const { body: appToken } = await this.agent
            .type(ContentType.FormUrlencoded)
            .buffer(true).parse(getJSONParse())
            .post(`${AuthURL}/api/oauth2/refreshToken.do`)
            .send({
                clientId: AppID,
                refreshToken: refreshToken,
                grantType: 'refresh_token',
                format: 'json',
            })

        appToken.expiry = new Date(Date.now() + appToken.expiresIn * 1000).getTime()
        return appToken
    }

    /**
     * 获取登录所需参数
     */
    async getLoginParam(): Promise<ILoginParam> {
        const { text: html } = await this.agent
            .query({
                appId: AppID,
                clientType: ClientType,
                returnURL: ReturnURL,
                timeStamp: timestamp(),
            })
            .get(`${WebURL}/api/portal/unifyLoginForPC.action`)

        const captchaToken = html.match(`'captchaToken' value='(.+?)'`)![1]
        const lt = html.match(`lt = "(.+?)"`)![1]
        const paramID = html.match(`paramId = "(.+?)"`)![1]
        const reqID = html.match(`reqId = "(.+?)"`)![1]
        return { captchaToken, lt, paramID, reqID }
    }

    /**
     * 判断登录是否需要验证码
     * @param usesrname
     */
    async needCaptcha(username: string): Promise<boolean> {
        const rsaUsername = await this.encryptData(username)
        const { body: need } = await this.agent
            .type(ContentType.FormUrlencoded)
            .post(`${AuthURL}/api/logbox/oauth2/needcaptcha.do`)
            .send({
                appKey: AppID,
                accountType: AccountType,
                userName: rsaUsername,
            })
        return Boolean(Number(need))
    }

    /**
     * 获取验证码
     * @param loginParam 
     */
    async getCaptchaImage({ captchaToken, reqID }: ILoginParam) {
        const resp = await this.agent
            .query({
                "token": captchaToken,
                "REQID": reqID,
                "rnd": timestamp(),
            })
            .get(`${AuthURL}/api/logbox/oauth2/picCaptcha.do`)
            .responseType('arraybuffer')

        return resp.body
    }

    /**
     * 获取加密参数
     */
    async getEncryptConf(refresh = false): Promise<IEncryptConf> {
        if (this.encryptConf == null || refresh) {
            const { body: { data: encryptConf } } = await this.agent
                .type(ContentType.FormUrlencoded)
                .buffer(true).parse(getJSONParse())
                .post(`${AuthURL}/api/logbox/config/encryptConf.do`)
                .send({ appId: AppID })

            this.encryptConf = encryptConf as IEncryptConf
        }
        return this.encryptConf
    }

    encryptData(data: string, joinPre?: boolean): Promise<string>
    encryptData(data: string[], joinPre?: boolean): Promise<string[]>
    encryptData<T extends string[]>(data: T, joinPre?: boolean): Promise<T>
    async encryptData(data: any, joinPre = true) {
        const encryptConf = await this.getEncryptConf()
        const publichKey = `-----BEGIN PUBLIC KEY-----\n${encryptConf.pubKey}\n-----END PUBLIC KEY-----`
        const rsaDatas = Transform.toArray<string>(data).map(data => {
            if (data.startsWith(encryptConf.pre))
                return data
            const rsaData = rsaEncrypt(publichKey, data)
            return joinPre ? (encryptConf.pre + rsaData) : rsaData
        })
        return Check.isArray(data) ? rsaDatas : rsaDatas[0]
    }

    createTokenSessionSource(token: IAppToken | null, tokenSource?: ITokenSource | null, session?: IAppSession | null, sessionSource?: ISessionSource | null): Required<ITokenSessionSource> {
        tokenSource = tokenSource ?? {
            token: async () => {
                if (token?.refreshToken == null) throw new Error('refreshToken is null')
                const newToken = await this.refreshToken(token.refreshToken)
                return newToken
            },
        }

        const refreshToken = async () => {
            token = (await tokenSource.refreshToken?.()) || (await tokenSource.token())
            return token
        }

        const getToken = async () => {
            if (token == null || (token.expiry && token.expiry < Date.now())) {
                token = await refreshToken()
            }
            return token
        }

        sessionSource = sessionSource ?? {
            session: async () => {
                const token = await getToken()
                const session = await this.getSessionForPC(token)
                return session
            }
        }

        const refreshSession = async () => {
            session = (await sessionSource.refreshSession?.()) || (await sessionSource.session())
            return session
        }

        const getSession = async () => {
            if (session == null) session = await refreshSession()
            return session
        }

        return {
            token: getToken,
            refreshToken,
            session: getSession,
            refreshSession
        }
    }
}

export interface ITokenSessionSource extends ITokenSource, ISessionSource { }

export interface ISessionSource {
    session(): Await<IAppSession>
    refreshSession?(): Await<IAppSession>
}

export interface ITokenSource {
    token(): Await<IAppToken>
    refreshToken?(): Await<IAppToken>
}