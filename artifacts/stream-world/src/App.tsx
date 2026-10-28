import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useGetCatalog, useGetProviderCatalog, useGetProviderRegions, useGetSeasonDetails, useGetTitleDetails, useGetToday,
  useGetTitleProviders, useGetTitleRecommendations, useGetTrending, useSearchCatalog,
  getGetCatalogQueryKey, getGetProviderCatalogQueryKey, getGetSeasonDetailsQueryKey,
  getGetProviderRegionsQueryKey, getGetTitleDetailsQueryKey, getGetTitleProvidersQueryKey, getGetTitleRecommendationsQueryKey, getGetTodayQueryKey, getGetTrendingQueryKey,
  getSearchCatalogQueryKey,
} from '@workspace/api-client-react';
import type { CatalogMediaItem, MediaType, ProviderRegion, WatchProvider } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowLeft, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Film, Folder, Heart, Home, Languages, ListFilter, Play, Search, Send,
  Share2, SlidersHorizontal, Star, UserRound, Video, X,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();
const POSTER = 'https://image.tmdb.org/t/p/w500';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280';
const genres = [
  { id: 0, name: 'All' }, { id: 28, name: 'Action' }, { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' }, { id: 878, name: 'Science Fiction' }, { id: 35, name: 'Comedy' },
  { id: 10402, name: 'Music & Musical' }, { id: 10749, name: 'Romance' }, { id: 10764, name: 'Reality-TV' },
  { id: 99, name: 'Documentary' }, { id: 10759, name: 'Action & Adventure' }, { id: 10768, name: 'War' },
  { id: 18, name: 'Drama' }, { id: 27, name: 'Horror' }, { id: 80, name: 'Crime' },
];
const navItems = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Streaming', href: '/streaming', icon: Video },
  { label: 'Categories', href: '/categories', icon: Folder },
  { label: 'Sharing', href: '/sharing', icon: Heart },
  { label: 'Me', href: '/me', icon: UserRound },
];
const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
const homeCategories = ['Recommend', 'Reality-TV', 'Movies', 'TV Shows', 'Anime', 'Korean Dramas'] as const;
type HomeCategory = (typeof homeCategories)[number];
const test = (name: string) => ({ 'data-testid': name });
const posterUrl = (path: string | null | undefined, size = POSTER) => path ? `${size}${path}` : '';
const yearOf = (date?: string | null) => date ? date.slice(0, 4) : '—';
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const uniqueTitles = (items: CatalogMediaItem[]) => items.filter((item, index) =>
  items.findIndex(candidate => candidate.mediaType === item.mediaType && candidate.id === item.id) === index,
);
const safeRead = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
};
const initialProviderRegion = () => {
  const locale = typeof navigator === 'undefined' ? 'en-US' : navigator.language;
  return locale.match(/-([a-z]{2})(?:-|$)/i)?.[1]?.toUpperCase() || 'US';
};
function useSaved<T,>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => safeRead(key, initial));
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue] as const;
}

function useLocalData() {
  const [favorites, setFavorites] = useSaved<CatalogMediaItem[]>('stream-world-favorites', []);
  const [history, setHistory] = useSaved<CatalogMediaItem[]>('stream-world-history', []);
  const [language, setLanguage] = useSaved('stream-world-language', 'English');
  const toggleFavorite = (item: CatalogMediaItem) => setFavorites(old => old.some(entry => entry.id === item.id) ? old.filter(entry => entry.id !== item.id) : [item, ...old]);
  const addHistory = (item: CatalogMediaItem) => setHistory(old => [item, ...old.filter(entry => entry.id !== item.id)].slice(0, 30));
  return { favorites, setFavorites, history, setHistory, language, setLanguage, toggleFavorite, addHistory };
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const active = navItems.find(item => item.href === location)?.label || (location.startsWith('/title') || location.startsWith('/player') || location.startsWith('/search') ? 'Home' : '');
  return <div className="app-shell">
    <main className="main-content">{children}</main>
    <nav className="bottom-nav" aria-label="Main navigation">
      {navItems.map(({ label, href, icon: Icon }) => <Link href={href} className={`nav-item ${active === label ? 'active' : ''}`} key={href} {...test(`nav-${label.toLowerCase()}`)}>
        <Icon size={21} strokeWidth={active === label ? 2.5 : 1.65} /><span>{label}</span>
      </Link>)}
    </nav>
  </div>;
}

function PageHeading({ eyebrow, title, action }: { eyebrow?: string; title: ReactNode; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1></div>{action}</div>;
}
function LoadingGrid() { return <div className="poster-grid" aria-label="Loading catalog">{Array.from({ length: 8 }, (_, i) => <div className="poster-skeleton" key={i}><div /><span /></div>)}</div>; }
function QueryError({ retry }: { retry: () => void }) { return <div className="empty-state"><span className="empty-icon"><CircleHelp /></span><h3>Couldn’t load titles</h3><p>Check your connection and give it another try.</p><button className="button-secondary" onClick={retry} {...test('button-retry')}>Try again</button></div>; }
function EmptyState({ title, copy }: { title: string; copy: string }) { return <div className="empty-state"><span className="empty-icon"><Film /></span><h3>{title}</h3><p>{copy}</p></div>; }

function PosterCard({ item, large = false, rank, favorite, onFavorite }: { item: CatalogMediaItem; large?: boolean; rank?: number; favorite?: boolean; onFavorite?: () => void }) {
  if (!item.posterPath) return null;
  const href = `/title/${item.mediaType}/${item.id}`;
  return <article className={`poster-card ${large ? 'poster-card-large' : ''}`} {...test(`card-title-${item.id}`)}>
    <Link href={href} className="poster-link" {...test(`link-title-${item.id}`)}>
      <div className="poster-frame"><img src={posterUrl(item.posterPath)} alt={`${item.title} poster`} loading="lazy" {...test(`img-poster-${item.id}`)} />
        {rank && <span className="rank-label">{String(rank).padStart(2, '0')}</span>}
        <span className="poster-rating"><Star size={12} fill="currentColor" /> {item.voteAverage?.toFixed(1) || '—'}</span>
      </div>
      <div className="poster-copy"><strong>{item.title}</strong><span>{item.mediaType === 'tv' ? 'Series' : 'Movie'} · {yearOf(item.releaseDate)}</span></div>
    </Link>
    {onFavorite && <button className={`favorite-button ${favorite ? 'is-favorite' : ''}`} onClick={onFavorite} aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} {...test(`button-favorite-${item.id}`)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} /></button>}
  </article>;
}
function PosterGrid({ items, favorites, toggleFavorite, emptyTitle = 'Nothing here yet', emptyCopy = 'Try changing your filters.', className = 'poster-grid' }: { items: CatalogMediaItem[]; favorites?: CatalogMediaItem[]; toggleFavorite?: (item: CatalogMediaItem) => void; emptyTitle?: string; emptyCopy?: string; className?: string }) {
  const withPosters = items.filter(item => item.posterPath);
  if (!withPosters.length) return <EmptyState title={emptyTitle} copy={emptyCopy} />;
  return <div className={className}>{withPosters.map((item, i) => <PosterCard key={`${item.mediaType}-${item.id}`} item={item} rank={i < 10 ? i + 1 : undefined} favorite={favorites?.some(entry => entry.id === item.id)} onFavorite={toggleFavorite ? () => toggleFavorite(item) : undefined} />)}</div>;
}
function PillRow({ options, value, onChange, testId }: { options: { label: string; value: string | number }[]; value: string | number; onChange: (v: string | number) => void; testId: string }) {
  return <div className="pill-row" role="tablist">{options.map(option => <button key={option.value} role="tab" aria-selected={value === option.value} className={`pill ${value === option.value ? 'selected' : ''}`} onClick={() => onChange(option.value)} {...test(`${testId}-${String(option.value).replace(/\W/g, '-')}`)}>{option.label}</button>)}</div>;
}

function HomePage() {
  const [, setLocation] = useLocation();
  const [searchText, setSearchText] = useState('');
  const [homeTab, setHomeTab] = useState<HomeCategory>('Recommend');
  const [featureIndex, setFeatureIndex] = useState(0);
  const [catalogPage, setCatalogPage] = useState(1);
  const [providerRegion] = useSaved('stream-world-provider-region', initialProviderRegion());
  const [relatedPage, setRelatedPage] = useState(1);
  const today = localToday();
  const media: MediaType = homeTab === 'Movies' ? 'movie' : 'tv';
  const genreId = homeTab === 'Reality-TV' ? 10764 : homeTab === 'Anime' ? 16 : homeTab === 'Korean Dramas' ? 18 : undefined;
  const originalLanguage = homeTab === 'Korean Dramas' ? 'ko' : undefined;
  const trendMediaType = homeTab === 'Recommend' ? 'all' as const : media;
  const trendParams = { mediaType: trendMediaType, timeWindow: 'week' as const };
  const trend = useGetTrending(trendParams, { query: { queryKey: getGetTrendingQueryKey(trendParams) } });
  const catalogParams = { mediaType: media, genreId, originalLanguage, sortBy: 'popularity.desc' as const, page: catalogPage };
  const catalog = useGetCatalog(catalogParams, { query: { queryKey: getGetCatalogQueryKey(catalogParams), enabled: homeTab !== 'Recommend' } });
  const todayParams = { date: today, mediaType: homeTab === 'Recommend' ? 'all' as const : media, genreId, originalLanguage };
  const todayTitles = useGetToday(todayParams, { query: { queryKey: getGetTodayQueryKey(todayParams) } });
  const koreanParams = { mediaType: 'tv' as const, genreId: 18, originalLanguage: 'ko', releaseDateLte: today, sortBy: 'release_date.desc' as const, page: 1 };
  const koreanTitles = useGetCatalog(koreanParams, { query: { queryKey: getGetCatalogQueryKey(koreanParams), enabled: homeTab === 'Recommend' || homeTab === 'TV Shows' } });
  const movies = useGetProviderCatalog({ mediaType: 'movie', watchRegion: providerRegion }, { query: { queryKey: getGetProviderCatalogQueryKey({ mediaType: 'movie', watchRegion: providerRegion }) } });
  const tvProviders = useGetProviderCatalog({ mediaType: 'tv', watchRegion: providerRegion }, { query: { queryKey: getGetProviderCatalogQueryKey({ mediaType: 'tv', watchRegion: providerRegion }) } });
  const providers = [...(movies.data || []), ...(tvProviders.data || [])]
    .filter((provider, index, list) => list.findIndex(item => item.providerId === provider.providerId) === index)
    .sort((a, b) => a.displayPriority - b.displayPriority);
  const matchesCategory = (item: CatalogMediaItem) =>
    (!genreId || item.genreIds.includes(genreId)) &&
    (!originalLanguage || item.originalLanguage === originalLanguage);
  const trendingForCategory = (trend.data?.results || []).filter(matchesCategory);
  const catalogResults = catalog.data?.results || [];
  const recommended = homeTab === 'Recommend' ? (trend.data?.results || []) : uniqueTitles([...trendingForCategory, ...catalogResults]);
  const featuredItems = (homeTab === 'Recommend' ? recommended : uniqueTitles([...trendingForCategory, ...catalogResults]))
    .filter(item => item.posterPath)
    .slice(0, 10);
  const currentFeature = featuredItems[featureIndex % Math.max(1, featuredItems.length)];
  const showKoreanShelf = homeTab === 'Recommend' || homeTab === 'TV Shows';
  useEffect(() => {
    if (featuredItems.length < 2) return;
    const timer = window.setInterval(() => {
      setFeatureIndex(index => (index + 1) % featuredItems.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [homeTab, featuredItems.length]);
  const changePicks = () => {
    setRelatedPage(page => page + 1);
    setCatalogPage(page => page + 1);
  };
  return <div className="home-page">
    <div className="home-search-row"><form className="top-search" onSubmit={e => { e.preventDefault(); if (searchText.trim()) setLocation(`/search/${encodeURIComponent(searchText.trim())}`); }} data-testid="form-global-search"><Search size={17} /><input aria-label="Search movies and series" placeholder="Search movies, series…" value={searchText} onChange={e => setSearchText(e.target.value)} data-testid="input-global-search" />{searchText && <button type="button" onClick={() => setSearchText('')} aria-label="Clear search" {...test('button-clear-search')}><X size={15} /></button>}</form><button className="history-shortcut" onClick={() => setLocation('/me?panel=history')} aria-label="Open watch history" {...test('button-home-history')}><Clock3 size={22} /></button></div>
    <div className="home-category-tabs" role="tablist">{homeCategories.map(label => <button key={label} role="tab" aria-selected={homeTab === label} className={homeTab === label ? 'active' : ''} onClick={() => { setHomeTab(label); setFeatureIndex(0); setCatalogPage(1); }} {...test(`tab-home-${label.toLowerCase().replace(/\W/g, '-')}`)}>{label}</button>)}</div>
    <div className="feature-carousel">
      {currentFeature ? <Link href={`/title/${currentFeature.mediaType}/${currentFeature.id}`} className="feature-banner" style={{ backgroundImage: `linear-gradient(90deg, rgba(2,10,17,.08), rgba(2,10,17,.02)), url(${posterUrl(currentFeature.backdropPath || currentFeature.posterPath, currentFeature.backdropPath ? BACKDROP : POSTER)})` }} {...test('link-featured-title')} aria-label={`Featured: ${currentFeature.title}`} /> : <div className="feature-banner feature-loading" />}
      <div className="feature-dots">{featuredItems.map((item, index) => <button key={`${item.mediaType}-${item.id}`} onClick={() => setFeatureIndex(index)} className={index === featureIndex ? 'selected' : ''} aria-label={`Show featured title ${index + 1}`} {...test(`button-feature-slide-${index + 1}`)} />)}{featuredItems.length > 1 && <button className="feature-next" onClick={() => setFeatureIndex(index => (index + 1) % featuredItems.length)} aria-label="Next featured title" {...test('button-feature-next')}><ChevronRight size={14} /></button>}</div>
    </div>
    <div className="section-toolbar home-section-toolbar"><h2>{homeTab === 'Korean Dramas' ? 'Korean Dramas' : homeTab === 'Recommend' ? 'Trending Now' : homeTab}</h2><Link href="/streaming" className="text-link" {...test('link-trending-chart')}>See all <ChevronRight size={15} /></Link></div>
    {trend.isLoading && homeTab === 'Recommend' || catalog.isLoading && homeTab !== 'Recommend' ? <LoadingGrid /> : trend.isError && homeTab === 'Recommend' ? <QueryError retry={() => trend.refetch()} /> : catalog.isError && homeTab !== 'Recommend' ? <QueryError retry={() => catalog.refetch()} /> : <div className="home-trending-grid">{recommended.slice(0, 9).map(item => <PosterCard key={`${item.mediaType}-${item.id}`} item={item} rank={undefined} />)}</div>}
    {showKoreanShelf && <div className="home-korean-section"><div className="section-toolbar"><h2>New Korean drama series</h2><button className="text-link-button" onClick={() => { setHomeTab('Korean Dramas'); setFeatureIndex(0); setCatalogPage(1); }} {...test('button-korean-dramas-see-all')}>See all <ChevronRight size={14} /></button></div>
      {koreanTitles.isLoading ? <LoadingGrid /> : koreanTitles.isError ? <QueryError retry={() => koreanTitles.refetch()} /> : <div className="home-korean-grid">{(koreanTitles.data?.results || []).filter(item => item.posterPath).slice(0, 9).map(item => <PosterCard key={`${item.mediaType}-${item.id}`} item={item} />)}</div>}
    </div>}
    <div className="home-compact-section"><div className="section-toolbar"><h2>New today</h2></div>
      {todayTitles.isLoading ? <div className="home-today-loading"><LoadingGrid /></div> : todayTitles.isError ? <QueryError retry={() => todayTitles.refetch()} /> : todayTitles.data?.results?.filter(item => item.posterPath).length ? <div className="home-today-grid">{todayTitles.data.results.filter(item => item.posterPath).slice(0, 9).map(item => <RecommendCard key={`${item.mediaType}-${item.id}`} item={item} badge={item.mediaType === 'tv' ? 'New episode' : 'New movie'} />)}</div> : <EmptyState title="Nothing new today" copy="New releases and episodes will appear here when they air." />}
    </div>
    <div className="home-related-section"><div className="section-toolbar"><h2>You may also like</h2></div>
      {catalog.isLoading && homeTab !== 'Recommend' ? <LoadingGrid /> : <div className="you-may-like-grid">{(recommended.length ? recommended : trend.data?.results || []).slice(2 + (relatedPage % 2), 6 + (relatedPage % 2)).map((item, i) => <RecommendCard key={`${item.mediaType}-${item.id}`} item={item} episodeBadge={item.mediaType === 'tv' && i % 2 === 0} />)}</div>}
      <div className="home-action-pair"><button onClick={changePicks} {...test('button-more-wonderful')}><ListFilter size={16} /> More Wonderful</button><button onClick={changePicks} {...test('button-change-recommendations')}><SlidersHorizontal size={16} /> Change</button></div>
    </div>
    <section className="home-streaming"><div className="section-toolbar"><h2>Streaming services</h2><Link href="/streaming" className="text-link" {...test('link-streaming-services')}>Explore <ChevronRight size={15} /></Link></div>
      <div className="provider-row">{providers.map((provider: WatchProvider) => <Link href={`/streaming/${provider.providerId}`} className="provider-tile" key={provider.providerId} {...test(`home-provider-${provider.providerId}`)} aria-label={`Browse ${provider.name}`} >{provider.logoPath ? <img src={posterUrl(provider.logoPath)} alt="" /> : <span className="provider-initial">{provider.name.slice(0, 1)}</span>}<span>{provider.name}</span></Link>)}</div>
    </section>
  </div>;
}

function RecommendCard({ item, episodeBadge, badge }: { item: CatalogMediaItem; episodeBadge?: boolean; badge?: string }) {
  if (!item.posterPath) return null;
  return <Link href={`/title/${item.mediaType}/${item.id}`} className="recommend-card" {...test(`link-recommended-${item.id}`)}>
    <div className="recommend-image"><img src={posterUrl(item.posterPath)} alt={`${item.title} poster`} />{(episodeBadge || badge) && <span className="episode-badge">{badge || 'New episode'}</span>}<span className="recommend-title-overlay">{item.title}</span><span className="recommend-rating">{item.voteAverage.toFixed(1)}</span></div>
    <div className="recommend-caption"><strong>{item.title}</strong><small>{item.mediaType === 'tv' ? 'TV series' : 'Movie'} · {yearOf(item.releaseDate)}</small></div>
  </Link>;
}

function StreamingPage() {
  const params = useParams<{ providerId?: string }>();
  const [chart, setChart] = useState<'hot' | 'soaring' | 'new' | 'search'>('hot');
  const [media, setMedia] = useState<'all' | 'movie' | 'tv'>('all');
  const [providerMedia, setProviderMedia] = useState<'movie' | 'tv'>('movie');
  const [providerPage, setProviderPage] = useState(1);
  const [providerRegion, setProviderRegion] = useSaved('stream-world-provider-region', initialProviderRegion());
  const providerRegions = useGetProviderRegions({ query: { queryKey: getGetProviderRegionsQueryKey() } });
  const movieProviders = useGetProviderCatalog({ mediaType: 'movie', watchRegion: providerRegion }, { query: { queryKey: getGetProviderCatalogQueryKey({ mediaType: 'movie', watchRegion: providerRegion }) } });
  const tvProviders = useGetProviderCatalog({ mediaType: 'tv', watchRegion: providerRegion }, { query: { queryKey: getGetProviderCatalogQueryKey({ mediaType: 'tv', watchRegion: providerRegion }) } });
  const providers = [...(movieProviders.data || []), ...(tvProviders.data || [])]
    .filter((provider, index, list) => list.findIndex(item => item.providerId === provider.providerId) === index)
    .sort((a, b) => a.displayPriority - b.displayPriority);
  const activeProviderId = Number(params.providerId);
  const hasActiveProvider = Number.isInteger(activeProviderId) && activeProviderId > 0;
  const activeProvider = providers.find(provider => provider.providerId === activeProviderId);
  const providerCatalogParams = {
    mediaType: providerMedia,
    watchProviderId: hasActiveProvider ? activeProviderId : undefined,
    watchRegion: providerRegion,
    sortBy: 'popularity.desc' as const,
    page: providerPage,
  };
  const providerTitles = useGetCatalog(providerCatalogParams, {
    query: {
      enabled: hasActiveProvider,
      queryKey: getGetCatalogQueryKey(providerCatalogParams),
    },
  });
  const selectedRegionName = providerRegions.data?.find(region => region.iso3166_1 === providerRegion)?.englishName || providerRegion;
  const regionSelect = <label className="provider-region-select"><span>Available in</span><select value={providerRegion} onChange={event => { setProviderRegion(event.target.value); setProviderPage(1); }} aria-label="Select streaming availability region" {...test('select-streaming-region')}>
    {providerRegions.data?.map(region => <option key={region.iso3166_1} value={region.iso3166_1}>{region.englishName}</option>)}
    {!providerRegions.data?.some(region => region.iso3166_1 === providerRegion) && <option value={providerRegion}>{selectedRegionName}</option>}
  </select><ChevronDown size={14} /></label>;
  if (hasActiveProvider) {
    return <div className="page-wrap streaming-page provider-page">
      <PageHeading title={activeProvider?.name || 'Streaming service'} action={<Link href="/streaming" className="text-link" {...test('link-all-streaming-services')}><ArrowLeft size={14} /> All services</Link>} />
      <div className="provider-page-controls"><p>Movies available on {activeProvider?.name || 'this service'} in {selectedRegionName}.</p>{regionSelect}</div>
      <div className="provider-media-tabs"><PillRow options={[{ label: 'Movies', value: 'movie' }, { label: 'Series', value: 'tv' }]} value={providerMedia} onChange={value => { setProviderMedia(value as 'movie' | 'tv'); setProviderPage(1); }} testId="filter-provider-media" /></div>
      {providerTitles.isLoading ? <LoadingGrid /> : providerTitles.isError ? <QueryError retry={() => providerTitles.refetch()} /> : <><div className="provider-result-count">{providerTitles.data?.totalResults.toLocaleString() || 0} titles in {selectedRegionName}</div>
        {providerTitles.data?.results.length ? <div className="ranked-grid streaming-grid">{providerTitles.data.results.map(item => <PosterCard key={`${item.mediaType}-${item.id}`} item={item} />)}</div> : <EmptyState title="No titles for this service" copy={`TMDb has no ${providerMedia === 'movie' ? 'movies' : 'series'} listed for ${activeProvider?.name || 'this service'} in ${selectedRegionName}. Try another region.`} />}
        {!!providerTitles.data?.totalPages && providerTitles.data.totalPages > 1 && <div className="provider-pagination"><button className="button-secondary" disabled={providerPage <= 1} onClick={() => setProviderPage(page => Math.max(1, page - 1))} {...test('button-provider-previous')}>Previous</button><span>Page {providerPage} of {providerTitles.data.totalPages}</span><button className="button-secondary" disabled={providerPage >= providerTitles.data.totalPages} onClick={() => setProviderPage(page => Math.min(providerTitles.data?.totalPages || page, page + 1))} {...test('button-provider-next')}>Next</button></div>}
      </>}
    </div>;
  }
  const today = localToday();
  const trendParams = { mediaType: media, timeWindow: chart === 'search' ? 'day' as const : 'week' as const };
  const trend = useGetTrending(trendParams, { query: { queryKey: getGetTrendingQueryKey(trendParams), enabled: chart === 'hot' || chart === 'search' } });
  const catalogMedia = media === 'all' ? 'movie' : media;
  const catalogSort = chart === 'new' ? 'release_date.desc' as const : 'vote_average.desc' as const;
  const catalogParams = { mediaType: catalogMedia, sortBy: catalogSort, releaseDateLte: chart === 'new' ? today : undefined, page: 1 };
  const catalog = useGetCatalog(catalogParams, { query: { queryKey: getGetCatalogQueryKey(catalogParams), enabled: chart === 'soaring' || chart === 'new' } });
  const items = (chart === 'hot' || chart === 'search' ? trend.data?.results || [] : catalog.data?.results || [])
    .filter(item => chart !== 'new' || (!!item.posterPath && !!item.releaseDate && item.releaseDate <= today));
  const loading = (chart === 'hot' || chart === 'search') ? trend.isLoading : catalog.isLoading;
  const failure = (chart === 'hot' || chart === 'search') ? trend.isError : catalog.isError;
  const retry = () => (chart === 'hot' || chart === 'search') ? trend.refetch() : catalog.refetch();
  return <div className="page-wrap streaming-page">
    <PageHeading title="Streaming" />
    <section className="provider-browser-section">
      <div className="provider-browser-heading"><div><h2>Streaming services</h2><p>Browse TMDb-listed services and see what’s available in your region.</p></div>{regionSelect}</div>
      {movieProviders.isLoading || tvProviders.isLoading ? <div className="provider-browser-loading"><div className="provider-skeletons"><i /><i /><i /><i /><i /></div></div> : movieProviders.isError || tvProviders.isError ? <QueryError retry={() => { void movieProviders.refetch(); void tvProviders.refetch(); }} /> : providers.length ? <div className="provider-browser-grid">{providers.map(provider => <Link href={`/streaming/${provider.providerId}`} className="provider-browser-tile" key={provider.providerId} {...test(`streaming-provider-${provider.providerId}`)}>{provider.logoPath ? <img src={posterUrl(provider.logoPath)} alt="" loading="lazy" /> : <span className="provider-browser-initial">{provider.name.slice(0, 1)}</span>}<span>{provider.name}</span></Link>)}</div> : <EmptyState title="No services found" copy={`TMDb doesn’t list streaming services for ${selectedRegionName}. Try another region.`} />}
    </section>
    <div className="chart-tabs">
      {([['hot', 'Hot Chart', 'tab-hot-chart'], ['soaring', 'Soaring List', 'tab-soaring-list'], ['new', 'New List', 'tab-new-list'], ['search', 'Hot Search', 'tab-hot-search']] as const).map(([value, label, id]) => <button key={value} className={chart === value ? 'chart-tab active' : 'chart-tab'} onClick={() => setChart(value)} {...test(id)}>{label}</button>)}
    </div>
    <div className="streaming-filters"><PillRow options={[{ label: 'All', value: 'all' }, { label: 'Movies', value: 'movie' }, { label: 'Series', value: 'tv' }]} value={media} onChange={v => setMedia(v as typeof media)} testId="filter-streaming-media" /></div>
    {loading ? <LoadingGrid /> : failure ? <QueryError retry={retry} /> : items.length ? <div className="ranked-grid streaming-grid">{items.map((item, i) => <PosterCard key={`${item.mediaType}-${item.id}`} item={item} rank={chart === 'hot' || chart === 'search' ? undefined : i + 1} />)}</div> : <EmptyState title="No titles in this chart" copy="Try a different category or chart." />}
  </div>;
}

function CategoriesPage() {
  const [media, setMedia] = useState<MediaType>('movie');
  const [genre, setGenre] = useState(0);
  const [year, setYear] = useState(0);
  const [sort, setSort] = useState('popularity.desc');
  const [page, setPage] = useState(1);
  const params = { mediaType: media, genreId: genre || undefined, year: year || undefined, sortBy: sort as 'popularity.desc' | 'release_date.desc' | 'vote_average.desc', page };
  const result = useGetCatalog(params, { query: { queryKey: getGetCatalogQueryKey(params) } });
  const sortOptions = [{ label: 'Popularity', value: 'popularity.desc' }, { label: 'Latest', value: 'release_date.desc' }, { label: 'Top rated', value: 'vote_average.desc' }];
  const update = (fn: () => void) => { fn(); setPage(1); };
  return <div className="page-wrap categories-page">
    <PageHeading title="Categories" action={<Link href="/search/discover" className="icon-button" aria-label="Search catalog" {...test('link-search-catalog')}><Search size={20} /></Link>} />
    <div className="filter-panel">
      <div className="filter-line"><span className="filter-label">Format</span><PillRow options={[{ label: 'Movies', value: 'movie' }, { label: 'TV Shows', value: 'tv' }]} value={media} onChange={v => update(() => setMedia(v as MediaType))} testId="filter-category-media" /></div>
      <div className="filter-line"><span className="filter-label">Genre</span><div className="filter-scroll"><PillRow options={genres.map(g => ({ label: g.name, value: g.id }))} value={genre} onChange={v => update(() => setGenre(Number(v)))} testId="filter-category-genre" /></div></div>
      <div className="filter-line"><span className="filter-label">Year</span><div className="filter-scroll"><PillRow options={[{ label: 'All years', value: 0 }, ...years.map(y => ({ label: String(y), value: y }))]} value={year} onChange={v => update(() => setYear(Number(v)))} testId="filter-category-year" /></div></div>
      <div className="filter-line"><span className="filter-label">Sort by</span><PillRow options={[{ label: 'Popularity', value: 'popularity.desc' }, { label: 'Latest', value: 'release_date.desc' }, { label: 'Top today', value: 'vote_average.desc' }]} value={sort} onChange={v => update(() => setSort(String(v)))} testId="filter-category-sort" /></div>
    </div>
    <div className="results-meta"><span>{result.data?.totalResults ? `${result.data.totalResults.toLocaleString()} titles` : 'Explore titles'}</span><span><ListFilter size={14} /> Sorted for you</span></div>
    {result.isLoading ? <LoadingGrid /> : result.isError ? <QueryError retry={() => result.refetch()} /> : <PosterGrid items={result.data?.results || []} className="category-grid" />}
    {result.data && result.data.totalPages > 1 && <div className="pagination"><button className="button-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)} {...test('button-page-previous')}><ChevronLeft size={16} /> Previous</button><span>Page {page} of {Math.min(result.data.totalPages, 500)}</span><button className="button-secondary" disabled={page >= result.data.totalPages} onClick={() => setPage(p => p + 1)} {...test('button-page-next')}>Next <ChevronRight size={16} /></button></div>}
  </div>;
}

function SharingPage() {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: 'RebelStream', text: 'Find your next favorite story.', url: shareUrl }); else { await navigator.clipboard.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } } catch { /* share sheet dismissed */ }
  };
  return <div className="page-wrap"><PageHeading eyebrow="Stories travel further" title="Sharing" />
    <section className="share-hero"><div className="share-orbit orbit-one" /><div className="share-orbit orbit-two" /><div className="share-copy"><span className="eyebrow">Pass the popcorn</span><h2>Good taste<br />is better shared.</h2><p>Send RebelStream to someone who always asks, “what should we watch?”</p><button className="button-primary" onClick={share} {...test('button-share-app')}>{copied ? <Check size={17} /> : <Share2 size={17} />}{copied ? 'Link copied' : 'Share RebelStream'}</button></div><div className="share-art"><span className="share-card card-back"><Film /></span><span className="share-card card-front"><Play fill="currentColor" /></span><span className="share-line">WORLDWIDE / 001</span></div></section>
    <section className="share-options"><h2>Choose how to share</h2><button onClick={share} className="share-option" {...test('button-share-link')}><span className="option-icon"><Share2 size={18} /></span><span><strong>Share a link</strong><small>Invite someone to explore with you</small></span><ChevronRight size={18} /></button><div className="share-option static"><span className="option-icon"><Heart size={18} /></span><span><strong>Share a favorite</strong><small>Open a title and tap the heart to save it first</small></span><ChevronRight size={18} /></div></section>
  </div>;
}

function MePage() {
  const [, setLocation] = useLocation();
  const { favorites, history, language, setLanguage, setFavorites, setHistory } = useLocalData();
  const [panel, setPanel] = useState<'language' | 'history' | 'favorites' | 'support' | 'customer' | 'vip' | ''>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('panel') === 'history' ? 'history' : '');
  const [message, setMessage] = useState('');
  return <div className="profile-page">
    <section className="profile-top"><div className="profile-avatar"><UserRound size={35} /></div><button className="vip-mini" onClick={() => setPanel(panel === 'vip' ? '' : 'vip')} {...test('button-vip-details')}><span>VIP</span><small>VIP has expired</small><ChevronRight size={15} /></button></section>
    <button className="vip-promo" onClick={() => setPanel(panel === 'vip' ? '' : 'vip')} {...test('button-vip-promo')}><span><strong>Join VIP skip the ads</strong><small>40%+ discount currently!</small></span><b>Subscribe <ChevronRight size={16} /></b></button>
    <section className="profile-menu">
      <button className="profile-row" onClick={() => setLocation('/sharing')} {...test('button-me-share')}><span className="menu-icon accent"><Share2 /></span><span><strong>Share</strong><small>Tell someone about RebelStream</small></span><ChevronRight /></button>
      <button className="profile-row" onClick={() => setPanel(panel === 'language' ? '' : 'language')} {...test('button-me-language')}><span className="menu-icon"><Languages /></span><span><strong>Language Switching</strong><small>{language}</small></span><ChevronRight /></button>
      <button className="profile-row" onClick={() => setPanel(panel === 'history' ? '' : 'history')} {...test('button-me-history')}><span className="menu-icon"><Clock3 /></span><span><strong>History</strong><small>{history.length} titles recently opened</small></span><ChevronRight /></button>
      <button className="profile-row" onClick={() => setPanel(panel === 'favorites' ? '' : 'favorites')} {...test('button-me-favorites')}><span className="menu-icon"><Bookmark /></span><span><strong>My favorites</strong><small>{favorites.length} titles saved</small></span><ChevronRight /></button>
      <button className="profile-row" onClick={() => setPanel(panel === 'support' ? '' : 'support')} {...test('button-me-support')}><span className="menu-icon"><CircleHelp /></span><span><strong>Feedback</strong><small>Tell us what you think</small></span><ChevronRight /></button>
      <button className="profile-row" onClick={() => setPanel(panel === 'customer' ? '' : 'customer')} {...test('button-me-customer-service')}><span className="menu-icon"><Send /></span><span><strong>Official customer service</strong><small>Contact and support</small></span><ChevronRight /></button>
    </section>
    {panel === 'vip' && <section className="inline-panel vip-panel"><h2>VIP membership</h2><p className="muted">Subscription features are not available in this discovery preview.</p></section>}
    {panel === 'language' && <section className="inline-panel"><h2>Choose your language</h2>{['English', 'Español', 'Français', '日本語'].map(label => <button className={`language-choice ${language === label ? 'chosen' : ''}`} onClick={() => setLanguage(label)} key={label} {...test(`language-${label.toLowerCase()}`)}>{label}{language === label && <Check size={16} />}</button>)}</section>}
    {panel === 'history' && <section className="inline-panel"><div className="panel-heading"><h2>Recently opened</h2>{history.length > 0 && <button className="text-button" onClick={() => setHistory([])} {...test('button-clear-history')}>Clear history</button>}</div>{history.length ? <div className="mini-title-list">{history.map(item => <MiniTitle item={item} key={item.id} />)}</div> : <EmptyState title="Your history is clear" copy="Titles you visit will appear here." />}</section>}
    {panel === 'favorites' && <section className="inline-panel"><div className="panel-heading"><h2>My favorites</h2>{favorites.length > 0 && <button className="text-button" onClick={() => setFavorites([])} {...test('button-clear-favorites')}>Clear favorites</button>}</div>{favorites.length ? <div className="mini-title-list">{favorites.map(item => <div className="favorite-list-row" key={item.id}><MiniTitle item={item} /><button className="remove-favorite" onClick={() => setFavorites(current => current.filter(entry => entry.id !== item.id))} aria-label={`Remove ${item.title} from favorites`} {...test(`button-remove-favorite-${item.id}`)}><X size={15} /></button></div>)}</div> : <EmptyState title="Save a story for later" copy="Tap the heart on a title to keep it here." />}</section>}
    {panel === 'support' && <section className="inline-panel"><h2>Send us a note</h2><p className="muted">Feedback stays on this device in this demo.</p><form className="feedback-form" onSubmit={e => { e.preventDefault(); if (message.trim()) setMessage('Thanks — your note is ready for our team.'); }}><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="What would make discovery better?" aria-label="Feedback message" {...test('input-feedback')} /><button className="button-primary" type="submit" {...test('button-send-feedback')}><Send size={15} /> Send feedback</button></form></section>}
    {panel === 'customer' && <section className="inline-panel"><h2>Official customer service</h2><p className="muted">Customer service contact is not configured in this preview. Use Feedback to leave a note.</p><button className="button-secondary" onClick={() => setPanel('support')} {...test('button-contact-feedback')}>Open feedback</button></section>}
  </div>;
}
function MiniTitle({ item }: { item: CatalogMediaItem }) { return <Link href={`/title/${item.mediaType}/${item.id}`} className="mini-title" {...test(`link-history-${item.id}`)}><div className="mini-poster">{item.posterPath && <img src={posterUrl(item.posterPath)} alt="" />}</div><span><strong>{item.title}</strong><small>{item.mediaType === 'tv' ? 'Series' : 'Movie'} · {yearOf(item.releaseDate)}</small></span><ChevronRight size={16} /></Link>; }

function SearchPage() {
  const params = useParams<{ query: string }>();
  const query = decodeURIComponent(params.query || '').trim();
  const apiParams = { query, page: 1 };
  const result = useSearchCatalog(apiParams, { query: { enabled: query.length > 0, queryKey: getSearchCatalogQueryKey(apiParams) } });
  return <div className="page-wrap"><PageHeading eyebrow="Search the collection" title={<>Results for <em>“{query}”</em></>} action={<Link href="/" className="icon-button" aria-label="Back home" {...test('link-back-home')}><ArrowLeft size={19} /></Link>} /><div className="results-meta"><span>{result.data?.totalResults ? `${result.data.totalResults} results` : 'Movies and series'}</span><span>Worldwide catalog</span></div>{result.isLoading ? <LoadingGrid /> : result.isError ? <QueryError retry={() => result.refetch()} /> : <PosterGrid items={result.data?.results || []} emptyTitle="No titles found" emptyCopy="Try another title, actor, or keyword." />}</div>;
}

function LegacyTitlePage() {
  const params = useParams<{ mediaType: string; id: string }>();
  const mediaType = params.mediaType === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  const [seasonNum, setSeasonNum] = useState(1);
  const [, setLocation] = useLocation();
  const details = useGetTitleDetails(mediaType, id, { query: { queryKey: getGetTitleDetailsQueryKey(mediaType, id) } });
  const title = details.data;
  const firstSeason = title?.seasons?.find(s => s.seasonNumber > 0)?.seasonNumber || 1;
  const selectedSeason = title?.seasons?.some(s => s.seasonNumber === seasonNum) ? seasonNum : firstSeason;
  const season = useGetSeasonDetails('tv', id, selectedSeason, { query: { enabled: mediaType === 'tv', queryKey: getGetSeasonDetailsQueryKey('tv', id, selectedSeason) } });
  const providerRegions = useGetTitleProviders(mediaType, id, { query: { queryKey: getGetTitleProvidersQueryKey(mediaType, id) } });
  const [providerRegionCode, setProviderRegionCode] = useState('WW');
  const similar = useGetCatalog({ mediaType, genreId: title?.genres?.[0]?.id, sortBy: 'popularity.desc', page: 1 }, { query: { enabled: !!title, queryKey: getGetCatalogQueryKey({ mediaType, genreId: title?.genres?.[0]?.id, sortBy: 'popularity.desc', page: 1 }) } });
  const { favorites, toggleFavorite, addHistory } = useLocalData();
  useEffect(() => { if (title) addHistory({ id: title.id, mediaType: title.mediaType, title: title.title, overview: title.overview, posterPath: title.posterPath, backdropPath: title.backdropPath, voteAverage: title.voteAverage, releaseDate: title.releaseDate, genreIds: title.genres.map(g => g.id), originalLanguage: '' }); }, [title?.id]);
  const handlePlay = (seasonNumber = 1, episodeNumber = 1) => setLocation(`/player/${mediaType}/${id}/${seasonNumber}/${episodeNumber}`);
  if (details.isLoading) return <div className="page-wrap"><div className="hero-skeleton" /><div className="poster-skeleton" /></div>;
  if (details.isError || !title) return <div className="page-wrap"><QueryError retry={() => details.refetch()} /></div>;
  const titleItem: CatalogMediaItem = { id: title.id, mediaType: title.mediaType, title: title.title, overview: title.overview, posterPath: title.posterPath, backdropPath: title.backdropPath, voteAverage: title.voteAverage, releaseDate: title.releaseDate, genreIds: title.genres.map(g => g.id), originalLanguage: '' };
  const watched = favorites.some(item => item.id === title.id);
  const regions = providerRegions.data as ProviderRegion[] | undefined;
  const currentRegion = regions?.find((r: ProviderRegion) => r.iso3166_1 === providerRegionCode);
  return <div className="title-page">
    <section className="title-hero" style={{ backgroundImage: title.backdropPath ? `linear-gradient(0deg, #07101b 2%, rgba(7,16,27,.72) 48%, rgba(7,16,27,.13)), url(${posterUrl(title.backdropPath, BACKDROP)})` : undefined }}>
      <div className="title-hero-content"><Link href="/" className="back-link" {...test('link-title-back')}><ArrowLeft size={16} /> Discover</Link>
        <div className="title-heading"><div className="title-poster">{title.posterPath && <img src={posterUrl(title.posterPath)} alt={`${title.title} poster`} />}</div><div className="title-summary"><span className="eyebrow">{title.mediaType === 'tv' ? 'SERIES' : 'FEATURE FILM'} <i /> {yearOf(title.releaseDate)}</span><h1>{title.title}</h1><div className="title-meta"><span><Star size={15} fill="currentColor" /> {title.voteAverage.toFixed(1)}</span><i />{title.runtime ? <span>{title.runtime} min</span> : title.numberOfSeasons ? <span>{title.numberOfSeasons} seasons</span> : null}<i /><span>{title.status || 'Available worldwide'}</span></div><div className="genre-tags">{title.genres.map(g => <span key={g.id}>{g.name}</span>)}</div><p>{title.overview || 'A story waiting to be discovered.'}</p><div className="title-actions"><button className="button-primary" onClick={() => handlePlay(selectedSeason, 1)} {...test('button-watch-trailer')}><Play size={16} fill="currentColor" /> Watch trailer</button><button className={`button-secondary ${watched ? 'saved' : ''}`} onClick={() => toggleFavorite(titleItem)} {...test('button-toggle-favorite')}>{watched ? <Check size={16} /> : <Heart size={16} />}{watched ? 'Saved' : 'Add to favorites'}</button></div></div></div>
      </div>
    </section>
    <div className="title-content">
      {title.mediaType === 'tv' && <section className="episodes-section"><div className="section-toolbar"><div><span className="eyebrow">Continue the story</span><h2>Episodes</h2></div><label className="season-select"><span>Season</span><select value={selectedSeason} onChange={e => setSeasonNum(Number(e.target.value))} aria-label="Choose season" {...test('select-season')}>{(title.seasons || []).filter(s => s.seasonNumber >= 0).map(s => <option key={s.id} value={s.seasonNumber}>{s.name || `Season ${s.seasonNumber}`}</option>)}</select><ChevronDown size={14} /></label></div>
        {season.isLoading ? <div className="episode-skeletons"><i /><i /><i /></div> : season.isError ? <QueryError retry={() => season.refetch()} /> : season.data?.episodes?.length ? <div className="episode-list">{season.data.episodes.map(ep => <button className="episode-row" key={ep.id} onClick={() => handlePlay(selectedSeason, ep.episodeNumber)} {...test(`button-episode-${ep.episodeNumber}`)}><span className="episode-number">{String(ep.episodeNumber).padStart(2, '0')}</span><span className="episode-still">{ep.stillPath ? <img src={posterUrl(ep.stillPath)} alt="" /> : <Play size={18} />}</span><span className="episode-info"><strong>{ep.name}</strong><small>Episode {ep.episodeNumber}{ep.runtime ? ` · ${ep.runtime} min` : ''}</small><span>{ep.overview}</span></span><Play className="episode-play" size={18} /></button>)}</div> : <EmptyState title="Episodes aren’t listed yet" copy="Season information will appear when available." />}
      </section>}
      <section className="providers-panel"><div><span className="eyebrow">Watch availability</span><h2>Streaming options</h2><p>Provider availability is country-specific. Worldwide is the default view.</p></div><div className="provider-region-content"><label className="region-select title-region-select"><SlidersHorizontal size={14} /><span>Region</span><select value={providerRegionCode} onChange={e => setProviderRegionCode(e.target.value)} aria-label="Choose provider region" {...test('select-title-provider-region')}><option value="WW">Worldwide</option>{regions?.filter(r => r.iso3166_1 !== 'WW').map(region => <option key={region.iso3166_1} value={region.iso3166_1}>{region.iso3166_1}</option>)}</select><ChevronDown size={14} /></label><div className="provider-logo-row">{currentRegion ? [...currentRegion.flatrate, ...currentRegion.rent, ...currentRegion.buy].slice(0, 5).map(provider => <div className="provider-logo" key={provider.providerId}>{provider.logoPath ? <img src={posterUrl(provider.logoPath)} alt={provider.name} /> : <span>{provider.name}</span>}</div>) : <span className="muted">{providerRegions.isLoading ? 'Loading provider availability…' : `No provider listing available for ${providerRegionCode === 'WW' ? 'worldwide' : providerRegionCode}.`}</span>}</div></div></section>
      <section className="cast-section"><div className="section-toolbar"><div><span className="eyebrow">The people behind it</span><h2>Cast</h2></div></div><div className="cast-row">{title.cast?.slice(0, 12).map(person => <div className="cast-card" key={person.id}><div className="cast-avatar">{person.profilePath ? <img src={posterUrl(person.profilePath)} alt="" /> : <UserRound size={22} />}</div><strong>{person.name}</strong><span>{person.character}</span></div>)}</div></section>
      <section className="similar-section"><div className="section-toolbar"><div><span className="eyebrow">Keep exploring</span><h2>You may also like</h2></div></div>{similar.isLoading ? <LoadingGrid /> : similar.isError ? <QueryError retry={() => similar.refetch()} /> : <div className="similar-grid">{(similar.data?.results || []).filter(item => item.id !== id).slice(0, 8).map(item => <PosterCard item={item} key={item.id} />)}</div>}</section>
    </div>
  </div>;
}

function TitlePage() {
  const params = useParams<{ mediaType: string; id: string }>();
  const mediaType = params.mediaType === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const [seasonNumber, setSeasonNumber] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [audioTrack, setAudioTrack] = useState<'Original' | 'Dub'>('Original');
  const [trailerStartedForId, setTrailerStartedForId] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [regionCode, setRegionCode] = useState('WW');
  const validId = Number.isInteger(id) && id > 0;
  const detailsQuery = useGetTitleDetails(mediaType, id, { query: { enabled: validId, queryKey: getGetTitleDetailsQueryKey(mediaType, id) } });
  const title = detailsQuery.data;
  const firstSeason = title?.seasons?.find(season => season.seasonNumber > 0)?.seasonNumber || 1;
  const selectedSeason = title?.seasons?.some(season => season.seasonNumber === seasonNumber) ? seasonNumber : firstSeason;
  const seasonQuery = useGetSeasonDetails('tv', id, selectedSeason, { query: { enabled: mediaType === 'tv' && validId, queryKey: getGetSeasonDetailsQueryKey('tv', id, selectedSeason) } });
  const providerQuery = useGetTitleProviders(mediaType, id, { query: { enabled: validId, queryKey: getGetTitleProvidersQueryKey(mediaType, id) } });
  const recommendations = useGetTitleRecommendations(mediaType, id, { query: { enabled: validId, queryKey: getGetTitleRecommendationsQueryKey(mediaType, id) } });
  const { favorites, toggleFavorite, addHistory } = useLocalData();
  const trailerStarted = trailerStartedForId === id;
  useEffect(() => {
    if (!title) return;
    addHistory({ id: title.id, mediaType: title.mediaType, title: title.title, overview: title.overview, posterPath: title.posterPath, backdropPath: title.backdropPath, voteAverage: title.voteAverage, releaseDate: title.releaseDate, genreIds: title.genres.map(g => g.id), originalLanguage: '' });
  }, [title?.id]);
  if (!validId) return <div className="page-wrap"><EmptyState title="Title unavailable" copy="This title link is not valid." /></div>;
  if (detailsQuery.isLoading) return <div className="title-page title-loading"><div className="title-trailer-skeleton" /><div className="poster-skeleton" /></div>;
  if (detailsQuery.isError || !title) return <div className="page-wrap"><QueryError retry={() => detailsQuery.refetch()} /></div>;
  const titleItem: CatalogMediaItem = { id: title.id, mediaType: title.mediaType, title: title.title, overview: title.overview, posterPath: title.posterPath, backdropPath: title.backdropPath, voteAverage: title.voteAverage, releaseDate: title.releaseDate, genreIds: title.genres.map(g => g.id), originalLanguage: '' };
  const favorite = favorites.some(item => item.id === title.id);
  const regions = providerQuery.data as ProviderRegion[] | undefined;
  const selectedRegion = regions?.find(region => region.iso3166_1 === regionCode);
  const shareTitle = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: title.title, text: `Discover ${title.title} on RebelStream`, url });
      else await navigator.clipboard.writeText(url);
    } catch { /* Share sheet dismissed. */ }
  };
  const openPlayer = () => setLocation(`/player/${mediaType}/${id}/${selectedSeason}/${selectedEpisode}`);
  const selectedSeasonSummary = title.seasons.find(season => season.seasonNumber === selectedSeason);
  const seasonEpisodeCount = seasonQuery.data
    ? Math.max(
      seasonQuery.data.episodeCount,
      ...seasonQuery.data.episodes.map(episode => episode.episodeNumber),
      0,
    )
    : selectedSeasonSummary?.episodeCount || 0;
  return <div className="title-page title-detail-page">
    <section className="title-trailer">
      {title.trailerKey && trailerStarted
        ? <div className="trailer-embed-wrap"><iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(title.trailerKey)}?autoplay=1&rel=0`} title={title.trailerName || `${title.title} official trailer`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen {...test('iframe-title-official-trailer')} /><a className="trailer-region-link" href={`https://www.youtube.com/watch?v=${encodeURIComponent(title.trailerKey)}`} target="_blank" rel="noreferrer" {...test('link-open-official-trailer')}>If unavailable in your region, open the official trailer on YouTube <ChevronRight size={13} /></a></div>
        : <div className="trailer-preview" style={{ backgroundImage: title.backdropPath || title.posterPath ? `linear-gradient(0deg,rgba(0,0,0,.72),rgba(0,0,0,.2)),url(${posterUrl(title.backdropPath || title.posterPath, BACKDROP)})` : undefined }}>
          {title.trailerKey ? <><button className="trailer-play-action" onClick={() => setTrailerStartedForId(id)} {...test('button-play-trailer')}><Play size={19} fill="currentColor" /><span>Play official trailer</span></button><span className="trailer-region-hint">If playback is unavailable in your region, open the official trailer on YouTube below.</span><a href={`https://www.youtube.com/watch?v=${encodeURIComponent(title.trailerKey)}`} target="_blank" rel="noreferrer" className="trailer-direct-link" {...test('link-open-official-trailer')}>Open on YouTube <ChevronRight size={13} /></a></> : <div className="trailer-preview-unavailable"><span className="eyebrow">OFFICIAL TRAILER</span><strong>No trailer available</strong><small>TMDb provides metadata and official trailer references, not full episode streams.</small></div>}
        </div>}
    </section>
    <div className="title-detail-body">
      <div className="title-intro-label"><span>{title.mediaType === 'tv' ? 'TV SERIES' : 'MOVIE'}</span><button onClick={openPlayer} {...test('button-open-player')}><Play size={14} /> {title.trailerKey ? 'Trailer' : 'Player details'}</button></div>
      <h1 className="title-detail-name" {...test('text-title-name')}>{title.title}{title.mediaType === 'tv' && <span> - Season {selectedSeason}</span>}</h1>
      <p className="title-detail-meta" {...test('text-title-metadata')}>{yearOf(title.releaseDate)} <i /> {title.id} <i /> {title.genres.map(genre => genre.name).join('/') || 'Series'}</p>
      <div className="title-quick-actions">
        <button className={favorite ? 'quick-action selected' : 'quick-action'} onClick={() => toggleFavorite(titleItem)} {...test('button-toggle-favorite')}><Bookmark size={19} fill={favorite ? 'currentColor' : 'none'} /><span>Favorite</span></button>
        <button className="quick-action" onClick={() => setFeedbackOpen(open => !open)} {...test('button-title-feedback')}><CircleHelp size={19} /><span>Feedback</span></button>
        <button className="quick-action" onClick={shareTitle} {...test('button-title-share')}><Share2 size={19} /><span>Share</span></button>
      </div>
      {feedbackOpen && <form className="title-feedback" onSubmit={e => { e.preventDefault(); if (feedback.trim()) { setFeedbackSent(true); setFeedback(''); } }}><textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Tell us what you think…" aria-label="Title feedback" {...test('input-title-feedback')} /><button type="submit" className="button-secondary" {...test('button-submit-title-feedback')}>{feedbackSent ? 'Sent' : 'Send feedback'}</button></form>}
      <div className="audio-track-row"><span>Language</span><div className="track-switch">{(['Original', 'Dub'] as const).map(track => <button key={track} className={audioTrack === track ? 'selected' : ''} onClick={() => setAudioTrack(track)} {...test(`button-audio-${track.toLowerCase()}`)}>{track}</button>)}</div></div>
      {audioTrack === 'Dub' && <p className="audio-note">Audio tracks are not supplied by TMDb; this setting is a preference only.</p>}
      {mediaType === 'tv' && <section className="episode-picker">
        <div className="episode-picker-head"><label className="season-picker"><select value={selectedSeason} onChange={e => { setSeasonNumber(Number(e.target.value)); setSelectedEpisode(1); }} aria-label="Select season" {...test('select-season')}>{(title.seasons || []).filter(season => season.seasonNumber >= 0).map(season => <option key={season.id} value={season.seasonNumber}>{season.seasonNumber === 0 ? 'Specials' : `Season ${season.seasonNumber}`}</option>)}</select><ChevronDown size={14} /></label>
          {seasonEpisodeCount > 0 && <span className="update-count">Update to {seasonEpisodeCount} <ChevronRight size={14} /></span>}</div>
        {seasonQuery.isLoading ? <div className="number-skeletons"><i /><i /><i /><i /><i /><i /></div> : seasonQuery.isError ? <QueryError retry={() => seasonQuery.refetch()} /> : seasonQuery.data?.episodes?.length ? <div className="episode-number-grid" aria-label="Episodes; swipe horizontally to see more">{seasonQuery.data.episodes.map(ep => <button className={selectedEpisode === ep.episodeNumber ? 'episode-number-button selected' : 'episode-number-button'} key={ep.id} onClick={() => setSelectedEpisode(ep.episodeNumber)} aria-label={`Episode ${ep.episodeNumber}: ${ep.name}`} {...test(`button-episode-${ep.episodeNumber}`)}>{ep.episodeNumber}</button>)}</div> : <EmptyState title="No episodes listed" copy="Episode details will appear when available." />}
      </section>}
      <section className="similar-section title-more-like"><div className="section-toolbar"><h2>More Like This</h2><Link href="/categories" className="text-link" {...test('link-more-like-this')}>More <ChevronRight size={14} /></Link></div>
        {recommendations.isLoading ? <LoadingGrid /> : recommendations.isError ? <QueryError retry={() => recommendations.refetch()} /> : <div className="horizontal-posters title-similar-row">{(recommendations.data?.results || []).filter(item => item.id !== id).slice(0, 8).map(item => <PosterCard key={item.id} item={item} />)}</div>}
      </section>
      <section className="title-providers"><div className="title-provider-heading"><h2>Watch availability</h2><label className="title-region-select"><span>Region</span><select value={regionCode} onChange={e => setRegionCode(e.target.value)} aria-label="Select availability region" {...test('select-title-provider-region')}><option value="WW">Worldwide</option>{regions?.filter(region => region.iso3166_1 !== 'WW').map(region => <option key={region.iso3166_1} value={region.iso3166_1}>{region.iso3166_1}</option>)}</select></label></div>
        <div className="provider-row">{selectedRegion ? [...selectedRegion.flatrate, ...selectedRegion.rent, ...selectedRegion.buy].slice(0, 8).map(provider => <div className="provider-tile" key={provider.providerId} {...test(`title-provider-${provider.providerId}`)}>{provider.logoPath ? <img src={posterUrl(provider.logoPath)} alt="" /> : <span className="provider-initial">{provider.name.slice(0, 1)}</span>}<span>{provider.name}</span></div>) : <p className="muted">{providerQuery.isLoading ? 'Loading availability…' : `No provider listings for ${regionCode === 'WW' ? 'Worldwide' : regionCode}.`}</p>}</div>
      </section>
    </div>
  </div>;
}

function PlayerPage() {
  const params = useParams<{ mediaType: string; id: string; season: string; episode: string }>();
  const mediaType = params.mediaType === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  const seasonNumber = Number(params.season);
  const episodeNumber = Number(params.episode);
  const details = useGetTitleDetails(mediaType, id, { query: { queryKey: getGetTitleDetailsQueryKey(mediaType, id) } });
  const episodeQuery = useGetSeasonDetails('tv', id, seasonNumber, { query: { enabled: mediaType === 'tv', queryKey: getGetSeasonDetailsQueryKey('tv', id, seasonNumber) } });
  const title = details.data;
  const episode = episodeQuery.data?.episodes?.find(ep => ep.episodeNumber === episodeNumber);
  const trailerKey = title?.trailerKey;
  return <div className="player-page"><div className="player-top"><Link href={title ? `/title/${mediaType}/${id}` : '/'} className="player-back" {...test('link-player-back')}><ArrowLeft size={18} /> Back to title</Link><span>REBELSTREAM / PLAYER</span></div>
    <div className="player-frame">{details.isLoading ? <div className="player-loading"><div /><span>Loading title information</span></div> : trailerKey ? <iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailerKey)}?autoplay=0&rel=0`} title={title?.trailerName || `${title?.title} official trailer`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen {...test('iframe-official-trailer')} /> : <div className="player-empty"><span className="player-play"><Play size={26} fill="currentColor" /></span><span className="eyebrow">TRAILER NOT AVAILABLE</span><h2>No official trailer found</h2><p>TMDb provides metadata and official trailer references, not full episode streams.</p></div>}</div>
     <div className="player-caption"><div><span className="eyebrow">{mediaType === 'tv' ? `SEASON ${seasonNumber} · EPISODE ${episodeNumber}` : 'OFFICIAL TRAILER'}</span><h1>{episode?.name || title?.title || 'Loading…'}</h1><p>{title?.title}{title?.trailerName && ` · ${title.trailerName}`}</p></div><div className="player-notice"><Video size={16} /><span>Full episode playback is not supplied by TMDb. This player shows an official trailer when one is available.{trailerKey && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(trailerKey)}`} target="_blank" rel="noreferrer" {...test('link-player-official-trailer')}>If unavailable in your region, watch on YouTube <ChevronRight size={12} /></a>}</span></div></div>
  </div>;
}

function RouteContent() {
  return <Switch>
    <Route path="/" component={HomePage} />
    <Route path="/streaming/:providerId" component={StreamingPage} />
    <Route path="/streaming" component={StreamingPage} />
    <Route path="/categories" component={CategoriesPage} />
    <Route path="/sharing" component={SharingPage} />
    <Route path="/me" component={MePage} />
    <Route path="/search/:query" component={SearchPage} />
    <Route path="/title/:mediaType/:id" component={TitlePage} />
    <Route path="/player/:mediaType/:id/:season/:episode" component={PlayerPage} />
    <Route component={NotFound} />
  </Switch>;
}
function Router() {
  const [location] = useLocation();
  const player = location.startsWith('/player/');
  return <ErrorBoundary resetKey={location}>{player ? <RouteContent /> : <AppShell><RouteContent /></AppShell>}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
