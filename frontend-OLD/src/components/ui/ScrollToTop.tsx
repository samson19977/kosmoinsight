import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Without this, react-router keeps the scroll position between page
// navigations, so clicking into a product from the bottom of a long
// list would land you mid-page on the new route.
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
