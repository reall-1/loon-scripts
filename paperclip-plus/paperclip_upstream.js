const upstream = {
  glados_extra: ["GLaDOS", "https://raw.githubusercontent.com/curtinp118/Scripthub/main/scripts/glados/glados.js", ""],
  qdreader_extra: ["起点读书", "https://raw.githubusercontent.com/Yuheng0101/X/main/Tasks/QDReader/qdreader.js", "[false,false,false,false,false,false,false]"],
  smzdm_extra: ["什么值得买", "https://raw.githubusercontent.com/reall-1/loon-scripts/main/smzdm_loon.js", ""]
};
const options = $argument || {};
const key = Object.keys(upstream).find(name => options[name] === true);
if (!key) {
  $done();
} else {
  runUpstream(key, options.merge === true);
}

function runUpstream(key, quiet) {
  const [name, url, argument] = upstream[key];
  const originalNotification = $notification;
  const originalDone = $done;
  const originalArgument = $argument;
  const usesGlobalAPI = key === "qdreader_extra";
  const notices = [];
  let finished = false;
  let patched = false;
  const notification = { post(title, subtitle, body, ...extra) {
    notices.push([title, subtitle, body].filter(Boolean).join(" "));
    if (!quiet) originalNotification.post(title, subtitle, body, ...extra);
  }};

  function finish(...args) {
    if (finished) return;
    finished = true;
    if (patched) {
      globalThis.$notification = originalNotification;
      globalThis.$done = originalDone;
      globalThis.$argument = originalArgument;
    }
    const result = notices.join(" · ");
    let s = "unknown";
    if (/无 Cookie|缺少登录凭证|未(?:获取到|找到|配置).*Cookie/i.test(result)) s = "none";
    else if (/(Cookie|凭证).{0,12}(失效|过期)|未登录/i.test(result)) s = "cookie";
    else if (/签到失败|执行异常|登录失败|请求失败|❌\s*[1-9]/i.test(result)) s = "fail";
    else if (/签到成功|已签到|重复签到|已签过|签到完成|签到[:： ]+成功/i.test(result)) s = "ok";
    const msg = result.slice(0, 900);
    try {
      $persistentStore.write(JSON.stringify({
        t: Date.now(), s, msg: s === "unknown" ? "未识别签到状态 " + msg : msg
      }), key + "_status");
    } finally {
      originalDone(...args);
    }
  }

  function fail(message) {
    notification.post(name, "执行异常", message);
    finish();
  }

  $httpClient.get({ url, timeout: 12, headers: { "Cache-Control": "no-cache" } }, (error, response, body) => {
    if (error || !response || Number(response.status || response.statusCode) !== 200 || typeof body !== "string" || !body.trim()) {
      fail("无法下载原脚本" + (response ? " HTTP " + (response.status || response.statusCode) : ""));
      return;
    }
    try {
      const execute = new Function("$notification", "$done", "$argument", body);
      if (usesGlobalAPI) {
        patched = true;
        globalThis.$notification = notification;
        globalThis.$done = finish;
        globalThis.$argument = argument;
      }
      execute(notification, finish, argument);
    } catch (error) {
      fail(String(error.message || error));
    }
  });
}
