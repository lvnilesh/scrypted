<template>
  <div
    style="position: relative; overflow: hidden; width: 100%; height: 100%"
    @wheel="doTimeScroll"
  >
    <video
      ref="video"
      style="
        background-color: black;
        width: 100%;
        height: 100%;
        z-index: 0;
        -webkit-transform-style: preserve-3d;
      "
      playsinline
      autoplay
    ></video>

    <svg
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      ref="svg"
      style="
        top: 0;
        left: 0;
        position: absolute;
        width: 100%;
        height: 100%;
        z-index: 1;
      "
      v-html="svgContents"
    ></svg>
    <ClipPathEditor
      v-if="clipPath"
      style="
        background: transparent;
        top: 0;
        left: 0;
        position: absolute;
        width: 100%;
        height: 100%;
        z-index: 2;
      "
      v-model="clipPath"
    ></ClipPathEditor>
    <v-btn
      v-if="$isMobile()"
      @click="$emit('exitFullscreen')"
      small
      icon
      color="white"
      style="position: absolute; top: 10px; right: 10px; z-index: 3"
    >
      <v-icon small>fa fa-times</v-icon></v-btn
    >

    <div style="position: absolute; bottom: 10px; right: 10px; z-index: 3">
      <v-dialog width="unset" v-model="dateDialog" v-if="showNvr">
        <template v-slot:activator="{ on }">
          <v-btn
            :dark="!isLive"
            v-on="on"
            small
            :color="isLive ? 'white' : 'blue'"
            :outlined="isLive"
          >
            <v-icon small color="white" :outlined="isLive"
              >fa fa-calendar-alt</v-icon
            >&nbsp;{{ monthDay }}</v-btn
          >
        </template>
        <v-date-picker @input="datePicked"></v-date-picker>
      </v-dialog>

      <v-btn
        v-if="showNvr"
        :dark="!isLive"
        small
        :color="isLive ? 'white' : adjustingTime ? 'green' : 'blue'"
        :outlined="isLive"
        @click="streamRecorder(Date.now() - 2 * 60 * 1000)"
      >
        <v-btn
          v-if="!isLive && adjustingTime"
          small
          :color="isLive ? 'white' : adjustingTime ? 'green' : 'blue'"
          :outlined="isLive"
        >
          {{ time }}</v-btn
        >
        <v-icon v-else small color="white" :outlined="isLive"
          >fa fa-video</v-icon
        ></v-btn
      >

      <v-btn
        small
        v-if="isLive && hasIntercom"
        @click="toggleMute"
        color="white"
        outlined
      >
        <v-icon v-if="muted" small color="white" :outlined="isLive"
          >fa fa-microphone-slash
        </v-icon>
        <v-icon v-else small color="white" :outlined="isLive"
          >fa fa-microphone
        </v-icon>
      </v-btn>

      <v-btn
        v-if="showNvr"
        :dark="!isLive"
        small
        color="red"
        :outlined="!isLive"
        @click="streamCamera"
        >Live</v-btn
      >
    </div>
  </div>
</template>

<script>
import { streamCamera, streamRecorder } from "../common/camera";
import { ScryptedInterface } from "@scrypted/types";
import ClipPathEditor from "../components/clippath/ClipPathEditor.vue";
import cloneDeep from "lodash/cloneDeep";
import { datePickerLocalTimeToUTC } from "../common/date";

export default {
  components: {
    ClipPathEditor,
  },
  props: ["clipPathValue", "device"],
  data() {
    return {
      dateDialog: false,
      adjustingTime: null,
      startTime: null,
      lastDetection: {},
      objectListener: this.device.listen(
        ScryptedInterface.ObjectDetector,
        (s, d, e) => {
          this.lastDetection = e || {};
        }
      ),
      muted: true,
      sessionControl: undefined,
      control: undefined,
      clipPath: this.clipPathValue ? cloneDeep(this.clipPathValue) : undefined,
    };
  },
  computed: {
    hasIntercom() {
      return (
        this.device.interfaces.includes(ScryptedInterface.Intercom) ||
        this.device.providedInterfaces.includes(
          ScryptedInterface.RTCSignalingChannel
        )
      );
    },
    isLive() {
      return !this.startTime;
    },
    time() {
      const d = this.startTime ? new Date(this.startTime) : new Date();
      const h = d.getHours().toString().padStart(2, "0");
      const m = d.getMinutes().toString().padStart(2, "0");
      const s = d.getSeconds().toString().padStart(2, "0");
      return `${h}:${m}:${s}`;
    },
    monthDay() {
      const d = this.startTime ? new Date(this.startTime) : new Date();
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    },
    showNvr() {
      return this.device.interfaces.includes(ScryptedInterface.VideoRecorder);
    },
    svgWidth() {
      return this.lastDetection?.inputDimensions?.[0] || 1920;
    },
    svgHeight() {
      return this.lastDetection?.inputDimensions?.[1] || 1080;
    },
    svgContents() {
      if (!this.lastDetection) return "";

      let contents = "";

      for (const detection of this.lastDetection.detections || []) {
        if (!detection.boundingBox) continue;
        const sw = 2;
        const s = "red";
        const x = detection.boundingBox[0];
        const y = detection.boundingBox[1];
        const w = detection.boundingBox[2];
        const h = detection.boundingBox[3];
        const t = detection.className;
        const fs = 20;
        const box = `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${s}" stroke-width="${sw}" fill="none" />
        <text x="${x}" y="${
          y - 5
        }" font-size="${fs}" dx="0.05em" dy="0.05em" fill="black">${t}</text>
        <text x="${x}" y="${y - 5}" font-size="${fs}" fill="white">${t}</text>`;
        contents += box;
      }

      return contents;
    },
  },
  mounted() {
    this.streamCamera();
  },
  destroyed() {
    this.cleanupConnection();
    this.objectListener.removeListener();
  },
  methods: {
    datePicked(value) {
      this.dateDialog = false;
      const dt = datePickerLocalTimeToUTC(value);
      this.streamRecorder(dt);
    },
    doTimeScroll(e) {
      if (!this.device.interfaces.includes(ScryptedInterface.VideoRecorder))
        return;
      if (!this.startTime) {
        this.startTime = Date.now() - 2 * 60 * 1000;
        return;
      }
      const adjust = Math.round(e.deltaY / 7);
      this.startTime -= adjust * 60000;
      clearTimeout(this.adjustingTime);
      this.adjustingTime = setTimeout(() => {
        this.adjustingTime = null;
        this.streamRecorder(this.startTime);
      }, 10);
    },
    cleanupConnection() {
      console.log("control cleanup");
      this.sessionControl?.close();
      this.sessionControl = undefined;
    },
    async toggleMute() {
      this.muted = !this.muted;
      if (!this.sessionControl?.control) return;
      this.sessionControl.control.setPlayback({
        audio: !this.muted,
        video: true,
      });
      this.sessionControl.session.setMicrophone(true);
    },
    async streamCamera() {
      this.cleanupConnection();
      this.startTime = null;
      this.sessionControl = await streamCamera(
        this.$scrypted.mediaManager,
        this.device,
        () => this.$refs.video
      );
    },
    async streamRecorder(startTime) {
      this.startTime = startTime;
      const control = await streamRecorder(
        this.$scrypted.mediaManager,
        this.device,
        startTime,
        this.sessionControl?.recordingStream,
        () => this.$refs.video
      );
      if (control) {
        this.cleanupConnection();
        this.sessionControl = control;
      }
    },
  },
  watch: {
    clipPath() {
      this.$emit("clipPath", cloneDeep(this.clipPath));
    },
  },
};
</script>
