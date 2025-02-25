import { RpcPeer } from '../../../../../server/src/rpc';
import { BrowserSignalingSession, waitPeerIceConnectionClosed } from '../../../../../common/src/rtc-signaling';

declare const eio: any;
declare const cast: any;

document.addEventListener("DOMContentLoaded", function (event) {
  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true;

  cast.framework.CastReceiverContext.getInstance().start(options);

  const context = cast.framework.CastReceiverContext.getInstance();
  const playerManager = context.getPlayerManager();
  const video = document.getElementById('media') as HTMLVideoElement;

  let previousCleanup: () => void;

  // intercept the LOAD request to be able to read in a contentId and get data
  const interceptor: (loadRequestData: any) => void = (loadRequestData: any) => {
    console.log(loadRequestData);

    const eioUrl = loadRequestData.media.entity || loadRequestData.media.contentId;
    const token = loadRequestData.credentials ?? loadRequestData.media.customData.token;
    const url = new URL(eioUrl)
    const endpointPath = url.pathname;
    const query: any = {}
    for (const [k, v] of new URLSearchParams(url.search)) {
      query[k] = v;
    }

    const options = {
      path: endpointPath,
      query,
    };

    const socket = eio(`wss://${url.host}`, options);
    socket.on('open', async () => {
      socket.send(JSON.stringify({
        token,
      }));

      const rpcPeer = new RpcPeer('cast-receiver', 'host', (message, reject) => {
        try {
          socket.send(JSON.stringify(message));
        }
        catch (e) {
          reject?.(e);
        }
      });
      socket.on('message', (data: any) => {
        rpcPeer.handleMessage(JSON.parse(data));
      });

      const session = new BrowserSignalingSession();

      const cleanup = () => {
        socket.close();
        session.pcDeferred.promise.then(pc => pc.close());        
      };
      previousCleanup?.();
      previousCleanup = cleanup;

      socket.on('close', cleanup);

      session.pcDeferred.promise.then(pc => {
        waitPeerIceConnectionClosed(pc).then(cleanup);

        const mediaStream = new MediaStream(
          pc.getReceivers().map((receiver) => receiver.track)
        );
        pc.ontrack = e => mediaStream.addTrack(e.track);
        video.srcObject = mediaStream;
      });

      rpcPeer.params['session'] = session;
    });

    return null;
  };

  playerManager.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, interceptor);
});
