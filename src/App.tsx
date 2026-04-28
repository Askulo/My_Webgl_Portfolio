import Experience from './components/canvas/Experience';

export default function App() {
  return (
    <div className='page'>
      <div className="scroll-container">
        <section className="section">Scroll Down</section>
        <section className="section">More Content</section>
        <section className="section">Even More</section>
      </div>
      <Experience />
    </div>
  );
}
