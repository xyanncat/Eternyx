'use client';

import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';

export default function Ribbon() {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(x, { stiffness: 70, damping: 18 });
  const rotateY = useSpring(y, { stiffness: 70, damping: 18 });
  function move(event) {
    if (reduce || event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    x.set(((event.clientY - bounds.top) / bounds.height - 0.5) * -12);
    y.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 16);
  }
  return (
    <div className="ribbon-stage" onPointerMove={move} onPointerLeave={() => { x.set(0); y.set(0); }} aria-hidden="true">
      <motion.div className="ribbon-tilt" style={reduce ? {} : { rotateX, rotateY }}>
        <img className="ribbon-art" src="/images/eternyx-ribbon.png" alt="" width="1536" height="1024" fetchPriority="high" />
      </motion.div>
    </div>
  );
}
