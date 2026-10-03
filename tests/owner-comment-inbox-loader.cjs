const ts = require("typescript");

module.exports = function (source) {
  if (this.resourcePath.endsWith(".css")) {
    const classes = {};
    const css = this.resourcePath.endsWith(".module.css")
      ? source.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => {
        classes[name] = `owner-comment-inbox_${name}`;
        return `.${classes[name]}`;
      }) : source;
    return `const style = document.createElement("style"); style.textContent = ${JSON.stringify(css)}; document.head.append(style); export default ${JSON.stringify(classes)};`;
  }
  return ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
  }, fileName: this.resourcePath }).outputText;
};
