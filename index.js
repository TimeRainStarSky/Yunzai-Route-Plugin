logger.info(logger.yellow("- 正在加载 路由插件"))

import makeConfig from "../../lib/plugins/config.js"
import httpProxy from "express-http-proxy"
import { WebSocket, WebSocketServer } from "ws"

const { config, configSave } = await makeConfig("Route", {
  tips: "",
  permission: "master",
  blackWord: "^$",
  token: [],
}, {
  tips: [
    "欢迎使用 TRSS-Yunzai Route Plugin ! 作者：时雨🌌星空",
    "参考：https://github.com/TimeRainStarSky/Yunzai-Route-Plugin",
  ],
})

const adapter = new class RouteAdapter {
  constructor() {
    this.blackWord = new RegExp(config.blackWord)
    this.wsUrl = {}
  }

  makeLog(msg) {
    if (msg.match(this.blackWord)) return
    Bot.makeLog("debug", msg)
  }

  httpProxy(token) {
    const path = `/${token.shift()}`

    token = token.join(":").split("/")
    const url = token.shift()

    if (token.length)
      token = `/${token.join("/")}`
    else
      token = ""
    const opts = { proxyReqPathResolver: req => `${token}${req.url.replace(/^\//, "")}` }

    const fnc = httpProxy(url, opts)
    Bot.express.use(path, (...args) => {
      logger.mark(`${logger.blue(`[${args[0].ip} => http://${url}${opts.proxyReqPathResolver(args[0])}]`)} HTTP ${args[0].method} 请求：${JSON.stringify(args[0].headers)}`)
      return fnc(...args)
    })
    logger.mark(`${logger.blue("[Route]")} ${path} => ${url}${token}`)
  }

  wsClose(conn) {
    if (conn.closed) return
    conn.closed = true
    logger.mark(`${logger.blue(`[${conn.id} <≠> ${this.wsUrl[conn.path]}]`)} 断开连接`)
    conn.ws.terminate()
    for (const i of conn.wsp) i.terminate()
  }

  wsConnect(conn) {
    conn.id = `${conn.req.connection.remoteAddress}-${conn.req.headers["sec-websocket-key"]}`
    logger.mark(`${logger.blue(`[${conn.id} <=> ${this.wsUrl[conn.path]}]`)} 建立连接：${JSON.stringify(conn.req.headers)}`)
    conn.wsp = []
    conn.ws.on("error", error => this.wsClose(conn))
    conn.ws.on("close", () => this.wsClose(conn))
    conn.ws.on("message", msg => {
      const data = String(msg).trim()
      for (const i of conn.wsp) i.send(data)
    })

    for (const i of this.wsUrl[conn.path]) {
      const wsp = new WebSocket(i, { headers: conn.req.headers })
      wsp.onopen = () => conn.wsp.push(wsp)
      wsp.onerror = error => { logger.error(error); this.wsClose(conn) }
      wsp.onclose = () => this.wsClose(conn)
      wsp.onmessage = msg => {
        const data = String(msg.data).trim()
        Bot.makeLog("debug", `${logger.blue(`[${conn.id} <= ${i}]`)} 消息：${data}`)
        conn.ws.send(data)
      }
    }
  }

  wsProxy(token) {
    const path = token.shift()
    const url = `ws://${token.join(":")}`
    logger.mark(`${logger.blue("[Route]")} /${path} => ${url}`)

    if (Array.isArray(this.wsUrl[path]))
      return this.wsUrl[path].push(url)
    this.wsUrl[path] = [url]

    if (!Array.isArray(Bot.wsf[path]))
      Bot.wsf[path] = []
    Bot.wsf[path].push((ws, req, ...args) => this.wsConnect({ path, url: this.wsUrl[path], ws, req, args }))
  }

  connect(token) {
    token = token.split(":")
    const scheme = token.shift().toLowerCase()
    switch (scheme) {
      case "http":
        this.httpProxy(token)
        break
      case "ws":
        this.wsProxy(token)
        break
    }
  }

  load() {
    for (const token of config.token)
      adapter.connect(token)
  }
}

Bot.adapter.push(adapter)

export class RouteAdapter extends plugin {
  constructor() {
    super({
      name: "RouteAdapter",
      dsc: "路由设置",
      event: "message",
      rule: [
        {
          reg: "^#路由列表$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#路由设置.+:.+:.+$",
          fnc: "Token",
          permission: config.permission,
        }
      ]
    })
  }

  List() {
    this.reply(`共${config.token.length}个路由：\n${config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#路由设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      this.reply(`路由已删除，重启后生效，共${config.token.length}个路由`, true)
    } else {
      config.token.push(token)
      this.reply(`路由已设置，重启后生效，共${config.token.length}个路由`, true)
    }
    await configSave()
  }
}

logger.info(logger.green("- 路由插件 加载完成"))