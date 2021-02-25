import { createServer, IncomingMessage, ServerResponse } from 'http'
import WebSocket from 'ws'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import nodeStatic from 'node-static'
import { Socket } from 'net'
import process from 'process'
import { Storage } from './Storage'
import { Collector } from './Collector'

export interface Configuration {
  path: string,
  port: number | undefined,
  storage: Storage | undefined,
  collector: Collector | undefined,
}

export class Dashboard {

  configuration: Configuration = {
    path: 'dashboard',
    port: undefined,
    storage: undefined,
    collector: undefined,
  }

  websocketServer: WebSocket.Server

  connections: Map<WebSocket, any> = new Map()

  /**
   * Constructor
   */
  constructor(configuration?: Partial<Configuration>) {
    this.configuration = {
      ...this.configuration,
      ...configuration,
    }

    // subscribe to storage additions and send them to the client
    this.configuration.storage?.on('add', data => {
      this.send(JSON.stringify({ data: [data] }))
    })

    this.websocketServer = new WebSocket.Server({ noServer: true })
    this.websocketServer.on('connection', this.handleConnection.bind(this))

    if (this.configuration.port) {
      this.createServer()
    }
  }

  createServer(): void {
    const { port } = this.configuration

    const server = createServer((request, response) => {
      if (!this.handleRequest(request, response)) {
        response.writeHead(404)
        response.end('Not Found')
      }
    })

    server.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head)
    })

    server.listen(port, () => process.stdout.write(
      `[${(new Date()).toISOString()}] Dashboard listening on port "${port}" … \n`,
    ))
  }

  handleRequest(request: IncomingMessage, response: ServerResponse): boolean {
    const { path } = this.configuration

    if (request.url?.split('/')[1] === path) {
      request.url = request.url.replace(path, '')

      const publicPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'dist')
      const server = new nodeStatic.Server(publicPath, { cache: 0 })

      request.addListener('end', () => server.serve(request, response)).resume()

      return true
    }

    return false
  }

  handleUpgrade(request: IncomingMessage, socket: Socket, head: any) {
    const { path } = this.configuration

    if (request.url?.split('/')[1] === path) {
      this.websocketServer.handleUpgrade(request, socket, head, ws => {
        this.websocketServer.emit('connection', ws, request)
      })

      return true
    }

    return false
  }

  handleConnection(connection: WebSocket, request: IncomingMessage): void {
    this.connections.set(connection, {})

    if (this.configuration.storage) {
      this.sendInitialDataToClient(connection)
    }

    connection.on('close', () => {
      this.close(connection)
    })
  }

  close(connection: WebSocket): void {
    this.connections.delete(connection)
    connection.close()
  }

  send(message: string) {
    this.connections.forEach((value, connection) => {
      if (connection.readyState === 2 || connection.readyState === 3) {
        return
      }

      try {
        connection.send(message, (error: any) => {
          if (error != null) this.close(connection)
        })
      } catch (exception) {
        this.close(connection)
      }
    })
  }

  private async sendInitialDataToClient(connection: WebSocket) {
    const data = await this.configuration.storage?.all() || []

    data.push({
      key: 'info',
      timestamp: null,
      value: this.configuration.collector?.info(),
    })

    setTimeout(() => {
      connection.send(JSON.stringify({ data }))
    }, 1000)
  }
}
