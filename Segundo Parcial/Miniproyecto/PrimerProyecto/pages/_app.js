import Menu from '../components/Menu';
import '../styles/style.css';

export default function App({Component, pageProds}) {
    return(
        <>
            <Menu />
            <Component {...pageProds} />
        </>
    );
}

