'use client';

import { useEffect } from 'react';
import { motion } from 'motion/react';
import { siteConfig } from '@/lib/site-config';

export default function ErrorPage({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="err-wrap">
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="err-code">500</div>
        <div className="hazard-strip" aria-hidden="true" />
        <h1>Something broke on our side</h1>
        <p>An unexpected error occurred while loading this page.</p>
        <motion.button
          className="btn"
          onClick={() => reset()}
          whileTap={{ scale: 0.97 }}
        >
          Try again
        </motion.button>
        <div className="mono-detail">
          <a href="/">or head back to {siteConfig.name}</a>
        </div>
      </motion.div>
    </div>
  );
}
