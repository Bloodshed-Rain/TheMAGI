import { useEffect, useRef, useState, type RefObject } from "react";

export function useFollowOutput(ref: RefObject<HTMLDivElement | null>, text: string) {
  const following = useRef(true);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onScroll = () => {
      following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
      if (following.current) setUnread(false);
    };
    element.addEventListener("scroll", onScroll);
    return () => element.removeEventListener("scroll", onScroll);
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (following.current) element.scrollTop = element.scrollHeight;
    else if (text) setUnread(true);
  }, [text, ref]);
  const resume = () => {
    following.current = true;
    setUnread(false);
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  };
  return { unread, resume };
}
