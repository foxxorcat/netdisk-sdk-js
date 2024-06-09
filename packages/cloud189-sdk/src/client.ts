import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { Await, Check, ContentType, Method, Transform } from '@netdisk-sdk/utils'

import { AccountType, ApiURL, AppID, AuthURL, ClientType, ReturnURL, WebURL, clientSuffix } from "./const";
import { ICloud189AuthApiResult, IAppSession, IAppToken, ICloud189ApiResult, IEncryptConf, ILoginOptionCommon, ILoginParam, SignType } from "./types";
import { aseEncrypt, formatDate, rsaEncrypt, signatureV1, signatureV2, sleep, timestamp } from "./helper";
import errcode from "err-code";
import { Cloud189SharedFSApi } from "./sharefs_api";

// const proxy = {
//     protocol: 'http',
//     host: '127.0.0.1',
//     port: 8888
// }
const proxy = void 0

export class Cloud189Client {
    axios: AxiosInstance;
    source: ITokenSessionSource
    shareApi: Cloud189SharedFSApi

    constructor(source: ITokenSessionSource, axiosInstance?: AxiosInstance) {
        this.source = source

        this.axios = axiosInstance ?? axios.create({
            headers: {
                Accept: "application/json;charset=UTF-8",
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36"
            },
            proxy
        })

        // 错误处理
        this.axios.interceptors.response.use(resp => {
            const data = resp.data
            if (Check.isObject(data)) {
                if ('result' in data && data.result != 0) {
                    // @ts-ignore
                    return Promise.reject(errcode(new Error(data.msg), { detail: data }))
                } else if ('res_code' in data && data.res_code != 0) {
                    // @ts-ignore
                    return Promise.reject(errcode(new Error(data.res_message), { detail: data }))
                }
            }
            return resp
        })

        this.shareApi = new Cloud189SharedFSApi(this)
    }

    /**
     * 用与api请求，包含签名加密
     * @param config 
     * @param signType 
     * @returns 
     */
    async requestApi<T, D>(config: AxiosRequestConfig<D>, signType: SignType = SignType.V2P) {
        const url = new URL(config.url || '/', config.baseURL)
        const searchParams = new URLSearchParams(config.params)
        const method = config.method?.toUpperCase() || Method.POST
        const session = await this.source.session()

        let headers = {}
        if (signType == SignType.V1) {
            headers = signatureV1(searchParams)
        } else if (session) {
            // 加密params参数
            const params = aseEncrypt(session.sessionSecret.slice(0, 16), searchParams.toString())
            config.params = { params }

            // 家庭云v2签名
            if (signType == SignType.V2F) {
                headers = signatureV2(method, url, params, {
                    sessionKey: session.familySessionKey,
                    sessionSecret: session.familySessionSecret
                })
            } else if (signType == SignType.V2P) {
                // 个人云v2签名
                headers = signatureV2(method, url, params, {
                    sessionKey: session.sessionKey,
                    sessionSecret: session.sessionSecret
                })
            }
        }

        const resp = await this.axios.request<T>({
            baseURL: ApiURL,
            ...config,
            method,
            headers: { ...config.headers, ...headers },
        })
        return resp
    }

    /**
     * 用于web请求，携带sessionKey
     * @param config 
     * @returns 
     */
    async requestWeb<T, D>(config: AxiosRequestConfig<D>) {
        const { sessionKey } = await this.source.session()

        return this.axios.request<T>({
            baseURL: WebURL,
            ...config,
            params: {
                ...config.params,
                sessionKey
            }
        })
    }
}

export class Cloud189AuthClient {
    axios: AxiosInstance;
    encryptConf?: IEncryptConf;

    constructor(axiosInstance?: AxiosInstance) {
        this.axios = axiosInstance ?? axios.create({
            headers: {
                Accept: "application/json;charset=UTF-8",
                'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36",
            },
            proxy
        })

        // 错误处理
        this.axios.interceptors.response.use(resp => {
            const data = resp.data
            if (Check.isObject(data)) {
                if ('result' in data && data.result != 0) {
                    // @ts-ignore
                    return Promise.reject(errcode(new Error(data.msg), { detail: data }))
                } else if ('res_code' in data && data.res_code != 0) {
                    // @ts-ignore
                    return Promise.reject(errcode(new Error(data.res_message), { detail: data }))
                }
            }
            return resp
        })
    }

    /**
     * @param refreshToken 
     * @returns 
     */
    async loginByRefreshToken(refreshToken: string): Promise<IAppToken> {
        const appToken = await this.refreshToken(refreshToken)
        return { ...appToken }
    }

    /**
     * 使用账户密码登录
     * @param loginParam 通过getLoginParam获取
     * @param username 未加密用户名
     * @param password 未加密密码
     * @param options 
     * @returns 
     */
    async loginByPassword(loginParam: ILoginParam, username: string, password: string, options: Partial<ILoginOptionCommon> = {}) {
        const rsaUsername = await this.encryptData(username)
        const rsaPassword = await this.encryptData(password)

        const { paramID, reqID, lt, captchaToken } = loginParam
        const { data: result } = await this.axios.post<ICloud189AuthApiResult<never, { toUrl: string }>>(
            "/api/logbox/oauth2/loginSubmit.do",
            {
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
            },
            {
                baseURL: AuthURL,
                headers: {
                    "Content-Type": ContentType.FormUrlencoded,
                    Referer: AuthURL,
                    Reqid: reqID,
                    lt: lt,
                }
            }
        )
        return await this.getSessionForPC({ redirectURL: result.toUrl })
    }

    /**
     * 根据cookie登录
     * 
     * @param cookies 
     */
    async loginByCookies(cookies: string) {
        if (!/SSON=([0-9a-z]*)/gi.test(cookies)) throw new Error('Cookies need key SSON')

        let redirectURL: string | undefined
        const resp = await this.axios.get<string>(
            "/api/portal/unifyLoginForPC.action",
            {
                baseURL: WebURL,
                params: {
                    appId: AppID,
                    clientType: ClientType,
                    returnURL: ReturnURL,
                    timeStamp: timestamp(),
                },
                headers: { cookie: cookies },
                beforeRedirect: (options, { statusCode, headers }) => {
                    options['headers']['cookie'] = cookies
                    if (statusCode == 302) redirectURL = headers['location']
                }
            },
        )
        if (redirectURL == null) throw new Error('login failed,No redirectURL obtained')
        return await this.getSessionForPC({ redirectURL })
    }

    /**
     * 二维码扫描登录
     */
    async loginByQR(loginParam: ILoginParam, showImage: (image: Uint8Array) => void, options: Partial<ILoginOptionCommon> = {}) {
        const { paramID } = loginParam
        const signal = options.signal
        delete options['signal']

        interface IUUIDResult {
            encodeuuid: string
            encryuuid: string
            uuid: string
        }
        const { data: { data: { uuid, encodeuuid, encryuuid } } } = await this.axios.post<ICloud189AuthApiResult<IUUIDResult>>(
            '/api/logbox/oauth2/getUUID.do',
            {
                appId: AppID,
            },
            {
                baseURL: AuthURL,
                headers: { "Content-Type": ContentType.FormUrlencoded },
                signal
            }
        )

        // 下载验证码
        const { data: image } = await this.axios.get<Uint8Array>(
            '/api/logbox/oauth2/image.do',
            {
                baseURL: AuthURL,
                params: { uuid: encodeuuid },
                responseType: 'arraybuffer',
                signal
            }
        )

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
            const { data: { status, redirectUrl } } = await this.axios.post<IState>(
                '/api/logbox/oauth2/qrcodeLoginState.do',
                {
                    uuid,
                    encryuuid,
                    appId: AppID,
                    clientType: ClientType,
                    returnUrl: ReturnURL,
                    paramId: paramID,

                    cb_SaveName: "3",
                    isOauth2: "false",
                    state: "",

                    timeStamp,
                    date,
                    ...options
                },
                {
                    baseURL: AuthURL,
                    headers: { "Content-Type": ContentType.FormUrlencoded },
                    signal
                }
            )

            switch (status) {
                case 0:
                    return await this.getSessionForPC({ redirectURL: redirectUrl })
                case -11001:// 过期
                    throw new Error('QR code expired')
                case -106: // 等待扫描
                case -11002://等待确认
                    await sleep(1000)
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
        const { data: result } = await this.axios.post<ICloud189ApiResult<never, IAppSession & IAppToken>>(
            "/getSessionForPC.action", void 0,
            {
                baseURL: ApiURL,
                headers: { Accept: "application/json;charset=UTF-8" },
                params: {
                    appId: AppID,
                    ...clientSuffix(),
                    ...params
                }
            },
        )
        result.expiry = new Date(Date.now() + 8640 * 1000).getTime()
        return result
    }

    /**
     * 刷新token
     * 
     * docs: https://id.189.cn/html/api_detail_493.html
     * @param refreshToken 
     */
    async refreshToken(refreshToken: string) {
        const { data: appToken } = await this.axios.post<IAppToken & { expiresIn: number }>(
            '/api/oauth2/refreshToken.do',
            {
                clientId: AppID,
                refreshToken: refreshToken,
                grantType: 'refresh_token',
                format: 'json',
            },
            {
                baseURL: AuthURL,
                headers: { "Content-Type": ContentType.FormUrlencoded }
            }
        )

        appToken.expiry = new Date(Date.now() + appToken.expiresIn * 1000).getTime()
        return appToken
    }

    /**
     * 获取登录所需参数
     */
    async getLoginParam(): Promise<ILoginParam> {
        const { data: html } = await this.axios.get<string>(
            "/api/portal/unifyLoginForPC.action",
            {
                baseURL: WebURL,
                params: {
                    appId: AppID,
                    clientType: ClientType,
                    returnURL: ReturnURL,
                    timeStamp: timestamp(),
                },
            },
        )
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

        const { data: need } = await this.axios.post<string>(
            "/api/logbox/oauth2/needcaptcha.do",
            {
                appKey: AppID,
                accountType: AccountType,
                userName: rsaUsername,
            },
            {
                baseURL: AuthURL,
                headers: { 'Content-Type': ContentType.FormUrlencoded }
            }
        )
        return Boolean(Number(need))
    }

    /**
     * 获取验证码
     * @param loginParam 
     */
    async getCaptchaImage({ captchaToken, reqID }: ILoginParam) {
        const { data } = await this.axios.get<Uint8Array>(
            "/api/logbox/oauth2/picCaptcha.do",
            {
                baseURL: AuthURL,
                params: {
                    "token": captchaToken,
                    "REQID": reqID,
                    "rnd": timestamp(),
                },
                responseType: 'arraybuffer',
            }
        )
        return data
    }

    /**
     * 获取加密参数
     */
    async getEncryptConf(refresh = false): Promise<IEncryptConf> {
        if (this.encryptConf == null || refresh) {
            const { data: { data: encryptConf } } = await this.axios.post<ICloud189AuthApiResult<IEncryptConf>>(
                "/api/logbox/config/encryptConf.do",
                {
                    appId: AppID
                },
                {
                    baseURL: AuthURL,
                    headers: {
                        'Content-Type': ContentType.FormUrlencoded
                    },
                },
            )
            this.encryptConf = encryptConf
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