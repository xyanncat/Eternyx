'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
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
        <div className="err-code" style={{ fontSize: 'clamp(70px, 16vw, 130px)' }}>500</div>
        <h1>Something broke on our side</h1>
        <p>{error?.message ?? 'An unexpected error occurred while loading this page.'}</p>
        <motion.button
          className="home-btn"
          style={{ border: 0, cursor: 'pointer' }}
          onClick={() => reset()}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          Try again
        </motion.button>
        <div style={{ marginTop: 18 }}>
          <a href="/" className="dim" style={{ fontSize: 13 }}>or head back to {siteConfig.name}</a>
        </div>
      </motion.div>
    </div>
  );
}
