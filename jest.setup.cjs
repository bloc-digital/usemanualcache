// Custom Jest environment: extends jsdom and exposes Node.js built-in
// fetch/Response globals that jsdom does not provide by default.
const JsdomEnvironment = require('jest-environment-jsdom').default;

class CustomEnvironment extends JsdomEnvironment {
  async setup() {
    await super.setup();
    // Expose Node.js 18+ built-in globals into the jsdom window
    this.global.Response = Response;
    this.global.fetch = fetch;
  }
}

module.exports = CustomEnvironment;
