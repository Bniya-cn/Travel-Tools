import { Link } from 'react-router-dom';

type Props = { savedHref: string };

export function PlannerSidebar({ savedHref }: Props) {
  return (
    <nav className="planner-sidebar" aria-label="行程导航">
      <Link className="planner-sidebar__brand" to="/" aria-label="返回旅行列表">行</Link>
      <div className="planner-sidebar__links">
        <a href="#today-itinerary">行程</a>
        <a href="#place-library">地点</a>
        <a href="#map-panel">地图</a>
        <Link to={savedHref}>已存</Link>
      </div>
      <span className="planner-sidebar__petal" aria-hidden />
    </nav>
  );
}
