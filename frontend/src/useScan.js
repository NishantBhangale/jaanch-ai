import { useEffect, useState } from 'react';
import { getScan, getSms, requestExplanation } from './api.js';

/** Reads a scan every 2 seconds until it has finished. Also asks for the explanation in the chosen language. */
export function useScan(id, lang) {
  const [scan, setScan] = useState(null);
  const [problem, setProblem] = useState(null); // 'notFound' | 'network'

  useEffect(() => {
    setScan(null);
    setProblem(null);
    if (!id) return undefined;
    let cancelled = false;
    let timer;
    async function load() {
      try {
        const data = await getScan(id);
        if (cancelled) return;
        setScan(data);
        setProblem(null);
        if (data.status === 'pending' || data.status === 'running') timer = setTimeout(load, 2000);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setProblem('notFound');
        } else {
          setProblem('network');
          timer = setTimeout(load, 4000);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  // When the language is switched, ask the server for that language's explanation once.
  const finished = scan?.status === 'done';
  const hasExplanation = Boolean(scan?.explanations?.[lang]);
  useEffect(() => {
    if (!id || !finished || hasExplanation) return undefined;
    let cancelled = false;
    let timer;
    async function poll() {
      try {
        const data = await getScan(id);
        if (cancelled) return;
        setScan(data);
        if (!data.explanations?.[lang]) timer = setTimeout(poll, 2500);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }
    requestExplanation(id, lang)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) timer = setTimeout(poll, 1500);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, finished, hasExplanation, lang]);

  return { scan, problem };
}

/** Reads an SMS result every 2 seconds until all its links have been checked. */
export function useSms(group) {
  const [sms, setSms] = useState(null);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    setSms(null);
    setProblem(null);
    if (!group) return undefined;
    let cancelled = false;
    let timer;
    async function load() {
      try {
        const data = await getSms(group);
        if (cancelled) return;
        setSms(data);
        setProblem(null);
        if (data.overall?.status === 'running') timer = setTimeout(load, 2000);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setProblem('notFound');
        } else {
          setProblem('network');
          timer = setTimeout(load, 4000);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [group]);

  return { sms, problem };
}
