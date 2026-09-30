/** Stop git from starting background auto-maintenance that can outlive a test's temp repo. */
export function withoutBackgroundGit(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const count = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10) || 0;
  for (let index = 0; index < count; index += 1) {
    if (env[`GIT_CONFIG_KEY_${index}`] === 'maintenance.auto') return env;
  }
  return {
    ...env,
    GIT_CONFIG_COUNT: String(count + 1),
    [`GIT_CONFIG_KEY_${count}`]: 'maintenance.auto',
    [`GIT_CONFIG_VALUE_${count}`]: 'false',
  };
}

Object.assign(process.env, withoutBackgroundGit(process.env));
