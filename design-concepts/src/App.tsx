import { lazy, Suspense, useEffect, useState } from 'react';
import Hub from './Hub';
import { ConceptSwitcher } from './ConceptSwitcher';

const Console = lazy(() => import('./concepts/console/Console'));
const Refined = lazy(() => import('./concepts/console-refined/Refined'));
const Ribbon = lazy(() => import('./concepts/console-ribbon/Ribbon'));
const Quad = lazy(() => import('./concepts/console-quad/Quad'));
const Solver = lazy(() => import('./concepts/console-solver/Solver'));
const Drafting = lazy(() => import('./concepts/drafting/Drafting'));
const Flow = lazy(() => import('./concepts/flow/Flow'));
const Launch = lazy(() => import('./concepts/launch/Launch'));

export type Route = '' | 'console' | 'refined' | 'ribbon' | 'quad' | 'solver' | 'drafting' | 'flow' | 'launch';
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
      {route === 'refined' && <Refined />}
      {route === 'ribbon' && <Ribbon />}
      {route === 'quad' && <Quad />}
      {route === 'solver' && <Solver />}
      {route === 'drafting' && <Drafting />}
      {route === 'flow' && <Flow />}
      {route === 'launch' && <Launch />}
      {route !== '' && <ConceptSwitcher route={route} />}
    </Suspense>
  );
}
