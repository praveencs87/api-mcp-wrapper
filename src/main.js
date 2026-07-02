import { Actor, log } from 'apify';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

// --- API Handler Functions ---

async function handleWeather(input) {
    const city = input.city || 'London';
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'curl/7.68.0' } });
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    const data = await res.json();
    const current = data.current_condition[0];
    return {
        action: 'weather',
        city,
        temperature_c: current.temp_C,
        temperature_f: current.temp_F,
        feels_like_c: current.FeelsLikeC,
        condition: current.weatherDesc[0].value,
        humidity_percent: current.humidity,
        wind_kmph: current.windspeedKmph,
        visibility_km: current.visibility,
        uv_index: current.uvIndex
    };
}

async function handleCurrency(input) {
    const from = (input.from || 'USD').toUpperCase();
    const to = (input.to || 'INR').toUpperCase();
    const amount = parseFloat(input.amount || 1);
    const url = `https://open.er-api.com/v6/latest/${from}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Currency API error: ${res.status}`);
    const data = await res.json();
    if (data.result !== 'success') throw new Error(`Currency API: ${data['error-type']}`);
    const rate = data.rates[to];
    if (!rate) throw new Error(`Unknown currency: ${to}`);
    return {
        action: 'currency',
        from,
        to,
        amount,
        rate,
        converted: parseFloat((amount * rate).toFixed(4)),
        last_updated: data.time_last_update_utc
    };
}

async function handleIpLookup(input) {
    const ip = input.ip || '';
    const url = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IP API error: ${res.status}`);
    const data = await res.json();
    if (data.status === 'fail') throw new Error(`IP Lookup failed: ${data.message}`);
    return { action: 'ip_lookup', ...data };
}

async function handleHolidays(input) {
    const country = (input.country || 'US').toUpperCase();
    const year = input.year || new Date().getFullYear();
    const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Holidays API error: ${res.status} — check country code and year`);
    const data = await res.json();
    return {
        action: 'holidays',
        country,
        year,
        total_holidays: data.length,
        holidays: data.map(h => ({
            date: h.date,
            name: h.name,
            localName: h.localName,
            types: h.types
        }))
    };
}

async function handleExchangeRates(input) {
    const base = (input.baseCurrency || 'USD').toUpperCase();
    const url = `https://open.er-api.com/v6/latest/${base}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Exchange rates API error: ${res.status}`);
    const data = await res.json();
    if (data.result !== 'success') throw new Error(`Exchange rates API: ${data['error-type']}`);
    return {
        action: 'exchange_rates',
        base,
        last_updated: data.time_last_update_utc,
        rates: data.rates
    };
}

function handleUuid() {
    return {
        action: 'uuid',
        uuid: randomUUID(),
        generated_at: new Date().toISOString()
    };
}

// --- Main ---
await Actor.init();

try {
    const input = await Actor.getInput();
    const { action } = input || {};

    if (!action) throw new Error('action is required! Choose from: weather, currency, ip_lookup, holidays, exchange_rates, uuid');

    log.info(`🔧 Executing action: ${action}`);
    await Actor.charge({ eventName: 'apify-actor-start', count: 1 });

    let result;
    switch (action) {
        case 'weather':        result = await handleWeather(input); break;
        case 'currency':       result = await handleCurrency(input); break;
        case 'ip_lookup':      result = await handleIpLookup(input); break;
        case 'holidays':       result = await handleHolidays(input); break;
        case 'exchange_rates': result = await handleExchangeRates(input); break;
        case 'uuid':           result = handleUuid(); break;
        default:
            throw new Error(`Unknown action: "${action}". Valid actions: weather, currency, ip_lookup, holidays, exchange_rates, uuid`);
    }

    await Actor.charge({ eventName: 'api-call', count: 1 });
    await Actor.pushData(result);
    await Actor.setValue('OUTPUT', result);

    log.info(`✅ Done! Action "${action}" completed successfully.`);
    log.info(`Result: ${JSON.stringify(result).substring(0, 200)}...`);
} catch (error) {
    console.error('CRASH:', error.message);
    await Actor.setValue('OUTPUT', { error: error.message });
    throw error;
} finally {
    await Actor.exit();
}
