window.BH = window.BH || {};

BH.api = (() => {
  const BASE = '/api';

  async function request(method, path, body, isForm) {
    const opts = { method, credentials: 'same-origin' };
    if (body !== undefined) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(BASE + path, opts);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      // Admin session expired mid-page: send back to the login screen instead
      // of surfacing "Authentication required" on whatever they were doing.
      if (res.status === 401 && path.startsWith('/admin/') && !path.endsWith('/login')
          && window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
      const message = (data && data.error) ? data.error : `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path),
    postForm: (path, formData) => request('POST', path, formData, true),
  };
})();
