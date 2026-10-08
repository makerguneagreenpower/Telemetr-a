import Dashboard from './dashboard';
import {getChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getChatGPTUser();return <Dashboard user={user?{name:user.displayName,email:user.email}:null}/>;}
