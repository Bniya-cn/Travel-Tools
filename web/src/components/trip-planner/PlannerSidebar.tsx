import { Link } from 'react-router-dom';
import { BookmarkCheck, LibraryBig, ListTodo, Map as MapIcon, Navigation } from 'lucide-react';

type Props = { savedHref: string };

export function PlannerSidebar({ savedHref }: Props) {
  return (
    <nav className="planner-sidebar" aria-label="行程导航">
      <Link className="planner-sidebar__brand" to="/" aria-label="返回旅行列表" title="返回旅行列表"><Navigation size={20} aria-hidden="true" /></Link>
      <div className="planner-sidebar__links">
        <a href="#today-itinerary" aria-label="今日行程" title="今日行程"><ListTodo size={19} aria-hidden="true" /><span>行程</span></a>
        <a href="#place-library" aria-label="地点库" title="地点库"><LibraryBig size={19} aria-hidden="true" /><span>地点</span></a>
        <a href="#map-panel" aria-label="行程地图" title="行程地图"><MapIcon size={19} aria-hidden="true" /><span>地图</span></a>
        <Link to={savedHref} aria-label="已保存行程" title="已保存行程"><BookmarkCheck size={19} aria-hidden="true" /><span>已存</span></Link>
      </div>
      <span className="planner-sidebar__petal" aria-hidden />
    </nav>
  );
}
