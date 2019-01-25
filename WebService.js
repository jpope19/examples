var { app, sessionParser } = require('../app');

var debug = require('debug')('skadoosh:WebService');
var http = require('http');
var models = require('../models');
var KetchrMessage = require('./../lib/KetchrMessage');

/**
 * Get port from environment and store in Express.
 */

var port = normalizePort(process.env.PORT || '3000');
app.set('port', port);

/**
 * Create HTTP server.
 */

var server = http.createServer(app);

const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });
let monitorSockets = {};
wss.on('connection', function connection(ws, req) {
  // You might use location.query.access_token to authenticate or share sessions
  // or req.headers.cookie (see https://stackoverflow.com/a/16395220/151312)
  ws.isAlive = true;
  
  let monitorId;
  ws.on('message', function incoming(message) {
    debug(`ws for monitorId: ${monitorId} received: ${message}`);
  });

  ws.on('close', function() {
    if (!!monitorId) {
      monitorSockets[monitorId] = monitorSockets[monitorId] || [];
      let index = monitorSockets[monitorId].indexOf(ws);
      if (index > -1) {
        debug(`closing websocket for monitor: ${monitorId}`);
        monitorSockets[monitorId].splice(index, 1);
      }
    } else {
      debug('attempted to close ws without a monitorId');
    }
  });

  ws.on('warning', onWarning);
  ws.on('pong', function() {
    this.isAlive = true;
  });

  sessionParser(req, {}, function() {
    monitorId = req.session.monitorId;
    if (!!monitorId) {
      monitorSockets[monitorId] = monitorSockets[monitorId] || [];
      monitorSockets[monitorId].push(ws);
      notificationController.getByMonitorId(monitorId).then( notifications => {
        if (!!notifications && notifications.length > 0) {
          ws.send(JSON.stringify({type: 'startup', data: notifications}));
        }
      });
    } else {
      ws.terminate();
    }
  });
});
wss.on('warning', onWarning);

// ping ws to prevent idle connection errors
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
 
    ws.isAlive = false;
    ws.ping('ping');
  });
}, 30000);

var notificationController = require('./../controllers/notification');
process.on('message', msg => {
  if (msg.type == KetchrMessage.types.WEB_NOTIFICATION) {
    let notifications = msg.data;
    for (let i = 0; i < notifications.length; i++) {
      if (notifications[i].type == models.enums.notificationType.POST) {
        let monitorId = notifications[i].monitorId;
        if (!!monitorSockets[monitorId]) {
          notificationController.getByMonitorPostId(monitorId, notifications[i].postId).then( notification => {
            for (let j = 0; j < monitorSockets[monitorId].length; j++) {
              monitorSockets[monitorId][j].send(JSON.stringify({type: 'notification', data: notification}));
            }
          });
        }
      }
    }
  }
});

process.on('warning', onWarning);

/**
 * Listen on provided port, on all network interfaces.
 */
models.init()
  .then( () => {
    server.listen(port);
    server.on('error', onError);
    server.on('listening', onListening);
    server.on('warning', onWarning);
  })
  .catch( err => {
    debug(err);
  });

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      debug(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      debug(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onWarning(error) {
  debug(error.stack);
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}
