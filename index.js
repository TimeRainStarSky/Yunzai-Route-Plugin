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
      Bot.makeLog("info", "", `${args[0].rid} => http://${url}${opts.proxyReqPathResolver(args[0])}`)
      return fnc(...args)
    })
    Bot.makeLog("mark", `${path} => ${url}${token}`, "Route")
  }

  wsClose(conn) {
    if (conn.closed) return
    conn.closed = true
    Bot.makeLog("info", "断开连接", `${conn.ws.rid} <≠> ${this.wsUrl[conn.path]}`)
    conn.ws.terminate()
    for (const i of conn.wsp) i.terminate()
  }

  wsConnect(conn) {
    Bot.makeLog("info", ["建立连接", conn.req.headers], `${conn.ws.rid} <=> ${this.wsUrl[conn.path]}`)
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
        if (!data.match(this.blackWord))
          Bot.makeLog("debug", ["消息", data], `${conn.ws.rid} <= ${i}`)
        conn.ws.send(data)
      }
    }
  }

  wsProxy(token) {
    const path = token.shift()
    const url = `ws://${token.join(":")}`
    Bot.makeLog("mark", `/${path} => ${url}`, "Route")

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