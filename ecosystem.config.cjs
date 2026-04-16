module.exports = {
  apps: [{
    name: 'whats-recall',
    script: 'src/index.ts',
    interpreter: 'bun',
    env: {
      NODE_ENV: 'production',
      // VERBOSE: 'true',
    },
    restart_delay: 3000,
    max_restarts: 10,
    autorestart: true,
  }],
};
