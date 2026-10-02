import { lazy, Suspense, useEffect, useState } from 'react';
import Hub from './Hub';
import { ConceptSwitcher } from './ConceptSwitcher';

const Console = lazy(() => import('./concepts/console/Console'));
const Drafting = lazy(() => import('./concepts/drafting/Drafting'));
const Flow = lazy(() => import('./concepts/flow/Flow'));
const Launch = lazy(() => import('./concepts/launch/Launch'));

export type Route = '' | 'console' | 'drafting' | 'flow' | 'launch';
const read = (): Route => (location.hash.replace('#', '') as Route) || '';

export default function App() {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return (
    <Suspense fallback={<div style={{ height: '100%', background: '#0b0d10' }} />}>
      {route === '' && <Hub />}
      {route === 'console' && <Console />}
      {route === 'drafting' && <Drafting />}
      {route === 'flow' && <Flow />}
      {route === 'launch' && <Launch />}
      {route !== '' && <ConceptSwitcher route={route} />}
    </Suspense>
  );
}
