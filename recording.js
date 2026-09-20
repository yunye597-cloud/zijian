(function () {
  "use strict";

  // Only the artwork canvas is captured: no screen, microphone, DOM, or cursor.
  window.createCanvasRecorder = function (canvas, onBusyChange) {
    const button = document.querySelector("#record-button");
    const status = document.querySelector("#record-status");
    const note = document.querySelector("#record-note");
    const preview = document.querySelector("#record-preview");
    const video = document.querySelector("#record-video");
    const save = document.querySelector("#save-video");
    let available = false, session = null, resultUrl = null;
    const supported = typeof canvas.captureStream === "function" &&
      typeof window.MediaRecorder === "function" && typeof MediaRecorder.isTypeSupported === "function";
    const formats = [
      'video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4',
      'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
    ];

    function message(text) { note.textContent = text; note.hidden = !text; }
    function clock(start) {
      const seconds = Math.floor((performance.now() - start) / 1000);
      status.textContent = `● REC ${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
    function clearResult() {
      video.pause(); video.removeAttribute("src"); video.load();
      save.removeAttribute("href"); preview.hidden = true;
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = null;
    }
    function release(current) {
      clearInterval(current.timer);
      current.stream.getTracks().forEach(track => track.stop());
      if (session !== current) return;
      session = null;
      status.hidden = true;
      button.textContent = "录制视频";
      button.classList.remove("is-recording");
      button.disabled = !available;
      onBusyChange(false);
    }
    function finish(current) {
      if (session !== current) return;
      const type = current.chunks.find(chunk => chunk.type)?.type || current.recorder.mimeType;
      const blob = new Blob(current.chunks, { type });
      current.chunks = [];
      release(current);
      if (!blob.size || !/^video\/(mp4|webm)(;|$)/i.test(type)) {
        message("这次未能生成视频，请重新录制，或换一个浏览器重试。"); return;
      }
      clearResult();
      resultUrl = URL.createObjectURL(blob);
      video.src = resultUrl;
      save.href = resultUrl;
      const extension = /^video\/mp4/i.test(type) ? "mp4" : "webm";
      save.download = `字间-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
      preview.hidden = false;
      message((current.failed ? "录制意外中断，已保留可用片段。" : "") +
        (extension === "webm" ? "当前浏览器生成的是 WebM 视频，如需上传部分视频平台，可转换为 MP4。" : "视频已生成，可以预览并保存。"));
    }
    function stop() {
      const current = session;
      if (!current || current.stopping) return;
      current.stopping = true;
      clearInterval(current.timer);
      button.disabled = true; button.textContent = "正在生成视频…";
      status.textContent = "正在生成视频…";
      try {
        if (current.recorder.state !== "inactive") current.recorder.stop();
        // An inactive recorder may still have final dataavailable/stop events queued.
      } catch {
        current.failed = true; finish(current);
      }
    }
    function start() {
      if (!available || session) return;
      if (!supported) {
        message("当前浏览器暂不支持画布录制，请在更新版本的系统浏览器中打开此网页后重试。"); return;
      }
      let stream;
      try {
        stream = canvas.captureStream(30);
        if (!stream.getVideoTracks().length) throw new Error("No video track");
        for (const mimeType of formats) {
          let recorder;
          try {
            if (!MediaRecorder.isTypeSupported(mimeType)) continue;
            recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
            const current = { recorder, stream, chunks: [], timer: null, failed: false, stopping: false };
            recorder.ondataavailable = event => { if (event.data.size) current.chunks.push(event.data); };
            recorder.onstop = () => finish(current);
            recorder.onerror = () => { current.failed = true; stop(); };
            // Constructor and start can fail even after a positive capability check.
            recorder.start(1000);
            session = current;
            video.pause();
            message(""); status.hidden = false;
            button.textContent = "停止录制"; button.classList.add("is-recording");
            const started = performance.now(); clock(started);
            current.timer = setInterval(() => clock(started), 250);
            stream.getVideoTracks()[0].addEventListener("ended", stop, { once: true });
            onBusyChange(true);
            return;
          } catch {
            if (recorder) {
              recorder.onstop = recorder.onerror = recorder.ondataavailable = null;
              if (recorder.state !== "inactive") { try { recorder.stop(); } catch {} }
            }
          }
        }
        throw new Error("No working encoder");
      } catch {
        if (stream) stream.getTracks().forEach(track => track.stop());
        message("当前浏览器无法开始录制，请关闭其他占用资源的页面后重试，或使用更新版本的系统浏览器。");
      }
    }
    button.addEventListener("click", () => session ? stop() : start());
    video.addEventListener("error", () => {
      if (resultUrl) message("当前浏览器无法预览此视频，你仍可保存后使用视频播放器打开。");
    });
    // Release hardware and keep a recoverable clip when a mobile browser goes away.
    window.addEventListener("pagehide", stop);
    window.addEventListener("beforeunload", event => {
      if (!session) return;
      event.preventDefault(); event.returnValue = "";
    });
    return {
      get busy() { return !!session; },
      setAvailable(value) { available = value; if (!session) button.disabled = !value; },
    };
  };
})();
