logger.info(logger.yellow("- 正在加载 代理 适配器插件"))

import { config, configSave } from "./Model/config.js"
import httpProxy from "express-http-proxy"
import { WebSocket, WebSocketServer } from "ws"

const adapter = new class ProxyAdapter {
  httpProxy(token) {
    const path = `/${token.shift()}`

    token = token.join(":").split("/")
    const url = token.shift()

    if (token.length)
      token = `/${token.join("/")}`
    else
      token = ""
    const opts = { proxyReqPathResolver: req => `${token}${req.url}` }

    const fnc = httpProxy(url, opts)
    Bot.express.use(path, (...args) => {
      logger.info(`${logger.blue(`[${args[0].ip} => ${url}${opts.proxyReqPathResolver(args[0])}]`)} HTTP ${args[0].method} 请求：${args[0].url} ${JSON.stringify(args[0].rawHeaders)}`)
      return fnc(...args)
    })
    logger.mark(`${logger.blue("[Proxy]")} ${path} => ${url}${token}`)
  }

  wsClose(conn) {
    if (conn.isClosed) return
    logger.mark(`${logger.blue(`[/${conn.path} <≠> ${conn.url}]`)} 断开连接`)
    conn.ws.close()
    conn.wsp.close()
    conn.isClosed = true
  }

  wsConnect(conn) {
    logger.mark(`${logger.blue(`[/${conn.path} <=> ${conn.url}]`)} 建立连接`)
    conn.ws.on("error", error => { logger.error(error); this.wsClose(conn) })
    conn.ws.on("close", () => this.wsClose(conn))

    conn.wsp = new WebSocket(conn.url)
    conn.wsp.onerror = error => { logger.error(error); this.wsClose(conn) }
    conn.wsp.onclose = () => this.wsClose(conn)

    conn.wsp.onopen = () => {
      conn.ws.on("message", data => {
        logger.info(`${logger.blue(`[/${conn.path} => ${conn.url}]`)} 消息：${data} `)
        conn.wsp.send(data)
      })
      conn.wsp.onmessage = msg => {
        logger.info(`${logger.blue(`[/${conn.path} <= ${conn.url}]`)} 消息：${msg.data}`)
        conn.ws.send(msg.data)
      }
    }
  }

  wsProxy(token) {
    const path = token.shift()
    const url = `ws://${token.join(":")}`
    if (!Bot.wss[path])
      Bot.wss[path] = new WebSocketServer({ noServer: true })
    Bot.wss[path].on("connection", ws => this.wsConnect({ path, url, ws }))
    logger.mark(`${logger.blue("[Proxy]")} /${path} => ${url}`)
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
    return true
  }
}

Bot.adapter.push(adapter)

export class Proxy extends plugin {
  constructor() {
    super({
      name: "ProxyAdapter",
      dsc: "代理 适配器设置",
      event: "message",
      rule: [
        {
          reg: "^#代理列表$",
          fnc: "List",
          permission: config.permission,
        },
        {
          reg: "^#代理设置.+:.+:.+$",
          fnc: "Token",
          permission: config.permission,
        }
      ]
    })
  }

  async List() {
    await this.reply(`共${config.token.length}个代理：\n${config.token.join("\n")}`, true)
  }

  async Token() {
    const token = this.e.msg.replace(/^#代理设置/, "").trim()
    if (config.token.includes(token)) {
      config.token = config.token.filter(item => item != token)
      await this.reply(`代理已删除，重启后生效，共${config.token.length}个代理`, true)
    } else {
      config.token.push(token)
      await this.reply(`代理已设置，重启后生效，共${config.token.length}个代理`, true)
    }
    configSave(config)
  }
}

logger.info(logger.green("- 代理 适配器插件 加载完成"))