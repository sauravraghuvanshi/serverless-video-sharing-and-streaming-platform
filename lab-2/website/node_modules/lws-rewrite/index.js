const EventEmitter = require('events')

class Rewrite extends EventEmitter {
  description () {
    return 'URL Rewriting. Use to re-route requests to local or remote destinations.'
  }

  optionDefinitions () {
    return [
      {
        name: 'rewrite',
        alias: 'r',
        type: String,
        multiple: true,
        typeLabel: '{underline expression} ...',
        description: "A list of URL rewrite rules. For each rule, separate the 'from' and 'to' routes with '->'. Whitespace surrounding the routes is ignored. E.g. '/from -> /to'."
      }
    ]
  }

  middleware (options) {
    const url = require('url')
    const util = require('./lib/util')
    const routes = util.parseRewriteRules(options.rewrite)
    if (routes.length) {
      this.emit('verbose', 'middleware.rewrite.config', { rewrite: routes })
      return routes.map(route => {
        if (route.to) {
          /* `to` address is remote if the url specifies a host */
          if (url.parse(route.to).host) {
            const _ = require('koa-route')
            return _.all(route.from, proxyRequest(route, this))
          } else {
            const rewrite = require('koa-rewrite-75lb')
            const rmw = rewrite(route.from, route.to, this)
            return rmw
          }
        }
      })
    }
  }
}

function proxyRequest (route, mw) {
  let id = 1
  return async function proxyMiddleware (ctx) {
    ctx.state.id = id++

    /* get remote URL */
    const util = require('./lib/util')
    const remoteUrl = util.getToUrl(ctx.url, route)

    /* info about this rewrite */
    const rewrite = {
      id: ctx.state.id,
      from: ctx.url,
      to: remoteUrl
    }

    /* emit verbose info */
    const reqInfo = {
      rewrite,
      method: ctx.request.method,
      headers: ctx.request.headers
    }

    const url = require('url')
    reqInfo.headers.host = url.parse(reqInfo.rewrite.to).host

    mw.emit('verbose', 'middleware.rewrite.remote.request', reqInfo)

    const request = require('request')
    ctx.respond = false
    ctx.req.pipe(
      request({
        url: reqInfo.rewrite.to,
        method: reqInfo.method,
        headers: reqInfo.headers
      })
      .on('response', response => {
        mw.emit('verbose', 'middleware.rewrite.remote.response', {
          rewrite,
          status: response.statusCode,
          headers: response.headers
        })
      })
    ).pipe(ctx.res)
  }
}

module.exports = Rewrite
