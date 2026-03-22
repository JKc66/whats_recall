module.exports = {
  apps: [{
    name: 'msg-monitor',
    script: 'src/index.js',
    interpreter: 'bun',
    env: {
      NODE_ENV: 'production',
    },
    restart_delay: 3000,
    max_restarts: 10,
    autorestart: true,
  }],
};
