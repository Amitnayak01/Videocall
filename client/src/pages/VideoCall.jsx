import { useEffect, useRef } from "react";
import { socket } from "../socket";
import React from "react";

export default function VideoCall() {
  const localRef = useRef();
  const remoteRef = useRef();
const pc = useRef(
  new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" }
    ]
  })
);


  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
      localRef.current.srcObject = stream;
      stream.getTracks().forEach(track => pc.current.addTrack(track, stream));
    });

    socket.emit("join-room");

    socket.on("ready", async () => {
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      socket.emit("offer", offer);
    });

    socket.on("offer", async (offer) => {
      await pc.current.setRemoteDescription(offer);
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      socket.emit("answer", answer);
    });

    socket.on("answer", answer => pc.current.setRemoteDescription(answer));
    socket.on("ice-candidate", candidate =>
      pc.current.addIceCandidate(new RTCIceCandidate(candidate))
    );

    pc.current.onicecandidate = e => e.candidate && socket.emit("ice-candidate", e.candidate);
    pc.current.ontrack = e => (remoteRef.current.srcObject = e.streams[0]);
  }, []);

  return (
    <div className="video-container">
      <video ref={localRef} autoPlay muted />
      <video ref={remoteRef} autoPlay />
    </div>
  );
}
