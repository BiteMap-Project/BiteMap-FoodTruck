import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import './OwnerDashboard.css';

const starter = {
    truck: {
        name: 'The Rolling Kitchen',
        address: '18111 Nordhoff St, Northridge, CA',
        hours: '11 AM – 8 PM',
        open: true,
    },
    menu: [
        { id: 1, name: 'Street tacos', price: 12, available: true },
        { id: 2, name: 'Harvest bowl', price: 13, available: true },
        { id: 3, name: 'Loaded fries', price: 8, available: false },
    ],
    orders: [
        { id: 1048, customer: 'Alex', total: 24, status: 0 },
        { id: 1047, customer: 'Jamie', total: 13, status: 1 },
    ],
};

type Dashboard = typeof starter;

const storageKey = 'bitemap-owner-dashboard';
const tabs = ['Overview', 'Menu', 'Orders', 'Truck Details'];
const stages = ['New', 'Preparing', 'Ready', 'Completed'];
const money = (value: number) => `$${value.toFixed(2)}`;

function loadDashboard(): Dashboard {
    try {
        const saved = localStorage.getItem(storageKey);

        if (saved) {
            const data = JSON.parse(saved) as Dashboard;

            if (data.truck && Array.isArray(data.menu) && Array.isArray(data.orders)) {
                return data;
            }
        }
    } catch {
        // Start with sample data if saved data cannot be loaded.
    }

    return starter;
}

export default function OwnerDashboard() {
    const [data, setData] = useState(loadDashboard);
    const [page, setPage] = useState('Overview');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(data));
        } catch {
            setNotice('Browser storage is unavailable. Changes may be lost on reload.');
        }
    }, [data]);

    function addItem(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const form = event.currentTarget;
        const fields = new FormData(form);
        const name = String(fields.get('name') ?? '').trim();
        const price = Number(fields.get('price'));

        if (!name || !Number.isFinite(price) || price < 0) return;

        setData((current) => ({
            ...current,
            menu: [
                ...current.menu,
                { id: Date.now(), name, price, available: true },
            ],
        }));

        form.reset();
    }

    function toggleItem(id: number) {
        setData((current) => ({
            ...current,
            menu: current.menu.map((item) =>
                item.id === id
                    ? { ...item, available: !item.available }
                    : item,
            ),
        }));
    }

    function advanceOrder(id: number) {
        setData((current) => ({
            ...current,
            orders: current.orders.map((order) =>
                order.id === id
                    ? { ...order, status: Math.min(order.status + 1, 3) }
                    : order,
            ),
        }));
    }

    function saveTruck(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const fields = new FormData(event.currentTarget);
        const name = String(fields.get('name') ?? '').trim();
        const address = String(fields.get('address') ?? '').trim();
        const hours = String(fields.get('hours') ?? '').trim();

        if (!name || !address || !hours) return;

        setData((current) => ({
            ...current,
            truck: { ...current.truck, name, address, hours },
        }));

        setNotice('Truck details saved.');
    }

    return (
        <div className="owner-dashboard">
            <aside>
                <h2>BiteMap</h2>
                <p>Owner workspace</p>

                <nav aria-label="Owner navigation">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            aria-current={page === tab ? 'page' : undefined}
                            onClick={() => setPage(tab)}
                        >
                            {tab}
                        </button>
                    ))}
                </nav>
            </aside>

            <main>
                <header>
                    <h1>{page}</h1>
                    <span>Demo dashboard</span>
                </header>

                <p role="status">{notice}</p>

                {page === 'Overview' && (
                    <>
                        <section className="truck-banner">
                            <h2>{data.truck.name}</h2>
                            <p>{data.truck.address}</p>
                            <p>{data.truck.hours}</p>

                            <button
                                aria-pressed={data.truck.open}
                                onClick={() =>
                                    setData((current) => ({
                                        ...current,
                                        truck: {
                                            ...current.truck,
                                            open: !current.truck.open,
                                        },
                                    }))
                                }
                            >
                                {data.truck.open ? 'Open — click to close' : 'Closed — click to open'}
                            </button>
                        </section>

                        <div className="cards">
                            <section>
                                <h3>Active orders</h3>
                                <strong>
                                    {data.orders.filter((order) => order.status < 3).length}
                                </strong>
                            </section>

                            <section>
                                <h3>Available items</h3>
                                <strong>
                                    {data.menu.filter((item) => item.available).length}
                                </strong>
                            </section>

                            <section>
                                <h3>Completed sales</h3>
                                <strong>
                                    {money(
                                        data.orders
                                            .filter((order) => order.status === 3)
                                            .reduce((sum, order) => sum + order.total, 0),
                                    )}
                                </strong>
                            </section>
                        </div>
                    </>
                )}

                {page === 'Menu' && (
                    <section>
                        <h2>Your menu</h2>

                        <form className="item-form" onSubmit={addItem}>
                            <label>
                                Item name
                                <input name="name" maxLength={80} required />
                            </label>

                            <label>
                                Price ($)
                                <input
                                    name="price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                />
                            </label>

                            <button type="submit">Add item</button>
                        </form>

                        {data.menu.map((item) => (
                            <article className="list-row" key={item.id}>
                                <div>
                                    <h3>{item.name}</h3>
                                    <p>{money(item.price)}</p>
                                </div>

                                <button
                                    aria-label={`Toggle availability for ${item.name}`}
                                    aria-pressed={item.available}
                                    onClick={() => toggleItem(item.id)}
                                >
                                    {item.available ? 'Available' : 'Sold out'}
                                </button>
                            </article>
                        ))}
                    </section>
                )}

                {page === 'Orders' && (
                    <section>
                        <h2>Pickup orders</h2>

                        {data.orders.length === 0 && <p>No orders yet.</p>}

                        {data.orders.map((order) => (
                            <article className="list-row" key={order.id}>
                                <div>
                                    <h3>#{order.id} · {order.customer}</h3>
                                    <p>{money(order.total)} · {stages[order.status]}</p>
                                </div>

                                {order.status < 3 && (
                                    <button onClick={() => advanceOrder(order.id)}>
                                        {['Accept order', 'Mark ready', 'Complete'][order.status]}
                                    </button>
                                )}
                            </article>
                        ))}
                    </section>
                )}

                {page === 'Truck Details' && (
                    <section>
                        <form className="truck-form" onSubmit={saveTruck}>
                            <label>
                                Truck name
                                <input name="name" defaultValue={data.truck.name} required />
                            </label>

                            <label>
                                Current address
                                <input name="address" defaultValue={data.truck.address} required />
                            </label>

                            <label>
                                Opening hours
                                <input name="hours" defaultValue={data.truck.hours} required />
                            </label>

                            <button type="submit">Save details</button>
                        </form>
                    </section>
                )}
            </main>
        </div>
    );
}