/*
MIT License

Copyright (c) 2025 Cat-zaizai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Port of Cat-zaizai/ZaiZaiCat-Checkin/script/smzdm to Loon.
const TITLE = '什么值得买';
const KEY = 'smzdm.loon.accounts.v1';
const USER = 'https://user-api.smzdm.com';
const WEB = 'https://zhiyou.m.smzdm.com/task/task/';
const TEST = 'https://test-api.smzdm.com';
const origin = 'https://test.m.smzdm.com';
const options = String(typeof $argument === 'undefined' ? '' : $argument).split(',');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const form = obj => Object.entries(obj).map(([k, v]) =>
  encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');

function md5(value) {
  const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const words = new Int32Array(Math.ceil((bytes.length + 9) / 64) * 16);
  for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes.charCodeAt(i) << (i % 4 * 8);
  words[bytes.length >> 2] |= 128 << (bytes.length % 4 * 8);
  words[words.length - 2] = bytes.length * 8;
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  const shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
  for (let offset = 0; offset < words.length; offset += 16) {
    let [a, b, c, d] = state;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const n = (a + f + Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) + words[offset + g]) | 0;
      const s = shifts[i >> 4][i % 4];
      [a, b, c, d] = [d, (b + ((n << s) | (n >>> (32 - s)))) | 0, b, c];
    }
    [a, b, c, d].forEach((n, i) => { state[i] = (state[i] + n) | 0; });
  }
  return state.map(n => [0, 8, 16, 24].map(s =>
    ((n >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('').toUpperCase();
}

function sign(params) {
  const pairs = Object.keys(params).sort().map(key => {
    const value = String(params[key] ?? '').replace(/[^\S\r\n]+/g, '');
    return value ? key + '=' + value : '';
  }).filter(Boolean);
  return md5(pairs.join('&') + '&key=zok5JtAq3$QixaA%mncn*jGWlEpSL3E1');
}

function cookieField(cookie, name) {
  const field = cookie.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='));
  const value = field ? field.slice(name.length + 1) : '';
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function accounts() {
  return JSON.parse($persistentStore.read(KEY) || '[]');
}

function capture() {
  const headers = Object.fromEntries(Object.entries($request.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const cookie = headers.cookie || '';
  const ua = headers['user-agent'] || '';
  const token = cookieField(cookie, 'sess');
  if (!token || !ua) return;
  const saved = accounts();
  const uid = cookieField(cookie, 'user_id') || cookieField(cookie, 'userid');
  const index = saved.findIndex(item => (uid && uid === item.uid) || token === cookieField(item.cookie, 'sess'));
  const entry = {uid, cookie, ua};
  if (index >= 0 && saved[index].cookie === cookie && saved[index].ua === ua) return;
  // Without a stable user ID, replace the current account when the session rotates.
  if (index >= 0) saved[index] = entry;
  else if (!uid) saved.splice(0, saved.length, entry);
  else {
    if (saved.length === 1 && !saved[0].uid) saved.length = 0;
    saved.push(entry);
  }
  if (!$persistentStore.write(JSON.stringify(saved), KEY)) throw new Error('写入凭证失败');
  $notification.post(TITLE, '登录凭证已保存', '可以在 Loon 手动执行签到任务');
}

function client(account) {
  return async (url, data, signed = false, publicRequest = false) => {
    const headers = {'Accept': 'application/json, text/plain, */*'};
    if (!publicRequest) Object.assign(headers, {
      Cookie: account.cookie, 'User-Agent': account.ua, Origin: origin, Referer: origin + '/'
    });
    if (signed) {
      const time = String(Date.now());
      data = {basic_v: '0', f: 'iphone', v: '11.1.35', weixin: '1', zhuanzai_ab: 'b', ...data, time};
      data.sign = sign(data);
      headers.request_key = time + '00000';
      headers['Accept-Language'] = 'zh-Hans-CN;q=1';
    }
    const request = {url, headers, timeout: 12000, 'auto-redirect': false, 'auto-cookie': false, insecure: false};
    if (data) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      request.body = form(data);
    }
    const path = url.split('?')[0].split('/').pop();
    return new Promise((resolve, reject) => {
      $httpClient[data ? 'post' : 'get'](request, (error, response, body) => {
        if (error || !response) return reject(new Error(path + ' 请求失败或超时'));
        const status = Number(response.status || response.statusCode);
        if (!(status >= 200 && status < 300)) return reject(new Error(path + ' HTTP ' + status));
        let result;
        try { result = JSON.parse(body); } catch (_) {
          return reject(new Error(path + ' 返回非 JSON'));
        }
        if (!result || typeof result !== 'object') return reject(new Error(path + ' 返回格式异常'));
        const msg = String(result.error_msg || '');
        if (path === 'checkin' && /已签到|已经签到|已签过/.test(msg)) return resolve({already: true});
        if (String(result.error_code) !== '0') {
          return reject(new Error(path + ' 业务错误码 ' + (result.error_code ?? '缺失')));
        }
        resolve(result.data ?? {});
      });
    });
  };
}

async function runAccount(account, label, deadline) {
  const send = client(account);
  const api = (path, data = {}) => send(USER + path, data, true);
  const test = (path, data) => send(TEST + path, data, true);
  const remaining = task => Math.max(0, Number(task.task_even_num || 1) - Number(task.task_finished_num || 0));
  const token = cookieField(account.cookie, 'sess');
  const stats = {done: 0, rewards: 0, failed: 0};
  const logError = error => { stats.failed++; console.log(label + ' ' + error.message); };
  let checkin;
  try {
    const result = await api('/checkin');
    checkin = result.already ? '今日已签到' : '签到成功' +
      (result.daily_num == null ? '' : '，连续 ' + result.daily_num + ' 天');
  } catch (error) {
    checkin = '签到失败（' + error.message + '）';
    logError(error);
  }
  if (options.includes('sign-only')) return label + ' ' + checkin;

  async function channel(articleId) {
    const data = await send('https://article-cdn.smzdm.com/preload/' +
      encodeURIComponent(articleId) + '/fiphone/v11_1_35/wx1/im0/hcae67e467x7q/h5cc7e8ebddb8f0f73.json',
      null, false, true);
    if (!data.channel_id) throw new Error('文章缺少频道 ID');
    return data.channel_id;
  }

  async function perform(task, zhongce) {
    const type = task.task_event_type;
    const id = task.article_id;
    if (type === 'interactive.view.article' && id && id !== '0') {
      const cid = Number(task.channel_id) ? task.channel_id : await channel(id);
      await api('/task/event_view_article_sync', {
        article_id: id, channel_id: cid, task_id: task.task_id, task_event_type: type
      });
      return true;
    }
    if (!zhongce) return false;
    const target = task.task_redirect_url?.link_val;
    if (target && type === 'interactive.favorite' && options.includes('favorite')) {
      await api('/favorites/create', {id: target, channel_id: await channel(target), token});
      return true;
    }
    if (target && type === 'interactive.rating' && options.includes('like')) {
      await api('/rating/like_create', {id: target, channel_id: await channel(target), token});
      return true;
    }
    const apply = type === 'guide.apply_zhongce' && options.includes('apply');
    const share = type === 'interactive.share' && options.includes('share');
    if (!apply && !share) return false;
    const list = await test('/probation/list', {offset: '0', status: apply ? 'progress' : 'all'});
    let count = 0;
    for (const item of list.rows || []) {
      if (count >= remaining(task) || Date.now() >= deadline) break;
      if (!item.article_id || (apply ? String(item.article_probation?.product_status) !== '1' :
        !item.article_channel_id)) continue;
      try {
        if (apply) await test('/probation/submit', {
          probation_id: item.article_id, attention_merchant: '0', remark_list: '["",""]'
        });
        else await api('/share/callback', {article_id: item.article_id, channel_id: item.article_channel_id, token});
        count++;
      } catch (error) { logError(error); }
      await delay(1200);
    }
    return count > 0;
  }

  async function module(load, zhongce) {
    if (Date.now() >= deadline) return;
    const first = await load();
    const claimed = new Set();
    async function claim(task) {
      if (!task.task_id || claimed.has(String(task.task_id))) return;
      await send(WEB + 'ajax_activity_task_receive', {task_id: task.task_id});
      claimed.add(String(task.task_id));
      stats.rewards++;
    }
    if (!zhongce && Number(first.info.activity_reward_status) === 1 && first.info.activity_id) {
      try {
        await api('/task/activity_receive', {activity_id: first.info.activity_id});
        stats.rewards++;
      } catch (error) { logError(error); }
    }
    let executed = false;
    for (const task of first.tasks) {
      if (Date.now() >= deadline) break;
      const status = Number(task.task_status);
      if (status === 4) continue;
      try {
        if (status === 3) await claim(task);
        else if (remaining(task) > 0 && await perform(task, zhongce)) {
          executed = true;
          stats.done++;
        } else continue;
      } catch (error) { logError(error); }
      await delay(1200);
    }
    if (!executed || Date.now() >= deadline) return;
    const refreshed = await load();
    for (const task of refreshed.tasks) {
      if (Date.now() >= deadline) break;
      if (Number(task.task_status) !== 3) continue;
      try { await claim(task); } catch (error) { logError(error); }
      await delay(1000);
    }
  }

  try {
    if (Date.now() < deadline) {
      const activity = await send(WEB + 'ajax_get_activity_id?from=zhongce');
      if (!activity.activity_id) throw new Error('未找到众测活动 ID');
      await module(async () => {
        const data = await send(WEB + 'ajax_get_activity_info?' + form({activity_id: activity.activity_id}));
        const tasks = data.activity_task;
        if (!tasks) throw new Error('众测任务列表格式异常');
        return {tasks: ['default_list', 'accumulate_list', 'clock_list'].flatMap(key => tasks[key] || [])};
      }, true);
    }
  } catch (error) { logError(error); }
  try {
    await module(async () => {
      const data = await api('/task/list_v2', {
        get_total: '1', limit: '100', offset: '0', point_type: '0', source_from: '任务活动'
      });
      const info = data.rows?.[0]?.cell_data;
      if (!info) throw new Error('互动任务列表格式异常');
      return {info, tasks: (info.activity_task?.default_list_v2 || []).flatMap(item => item.task_list || [])};
    }, false);
  } catch (error) { logError(error); }
  const cutoff = Date.now() >= deadline ? '，运行时间已达上限' : '';
  return label + ' ' + checkin + '，任务提交 ' + stats.done + '，领奖 ' + stats.rewards +
    '，失败 ' + stats.failed + cutoff;
}

(async () => {
  if (typeof $request !== 'undefined') return capture();
  const saved = accounts();
  if (!saved.length) {
    $notification.post(TITLE, '缺少登录凭证', '开启插件和 MITM 后，在 App 打开签到或任务中心');
    return;
  }
  const deadline = Date.now() + 240000;
  const results = [];
  for (let i = 0; i < saved.length; i++) {
    if (Date.now() >= deadline) {
      results.push('剩余 ' + (saved.length - i) + ' 个账号等待下次执行');
      break;
    }
    results.push(await runAccount(saved[i], '账号 ' + (i + 1), deadline));
  }
  console.log(results.join('\n'));
  $notification.post(TITLE, '执行结果', results.join('\n'));
})().catch(error => {
  $notification.post(TITLE, '执行异常', error.message);
}).finally(() => $done({}));
