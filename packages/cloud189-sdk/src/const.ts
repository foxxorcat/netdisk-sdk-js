const WebURL = "https://cloud.189.cn",
    AuthURL = "https://open.e.189.cn",
    ApiURL = "https://api.cloud.189.cn",
    MURL = "https://m.cloud.189.cn",

    AccountType = "02",
    AppID = "8025431004",
    ClientType = "10020",
    Version = "6.2",

    PC = "TELEPC",
    ChannelID = "web_cloud.189.cn",
    ReturnURL = "https://m.cloud.189.cn/zhuanti/2020/loginErrorPc/index.html"

const clientSuffix = () => ({
    "clientType": PC,
    "version": Version,
    "channelId": ChannelID,
    "rand": Date.now(),
})

export {
    WebURL,
    AuthURL,
    ApiURL,
    MURL,

    AccountType,
    AppID,
    ClientType,
    Version,

    PC,
    ChannelID,
    ReturnURL,
    clientSuffix
}