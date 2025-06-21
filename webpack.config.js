const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
      popup: "./src/popup.ts",
      background: "./src/background.ts",
      content: "./src/content.ts",
      embeddings: "./src/embeddings.ts",
      chat: "./src/chat.ts",
      chatUI: "./src/chatUI.ts"
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "ts-loader",
          exclude: /node_modules/
        }
      ]
    },
    resolve: {
      extensions: [".ts", ".js"]
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: "manifest.json", to: "manifest.json" },
          { from: "popup.html", to: "popup.html" },
          { from: "popup.css", to: "popup.css" },
          { from: "icons", to: "icons" }
        ]
      })
    ],
    mode: isProduction ? "production" : "development",
    devtool: isProduction ? false : "inline-source-map",
    optimization: {
      minimize: isProduction
    }
  };
};
