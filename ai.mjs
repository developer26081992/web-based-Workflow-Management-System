export const priorityValues = ['low','medium','high'];

const demo = {
  summary: { summary: 'Confirm the mitigation owners, check the updated target dates and prepare the risk register for approval.' },
  suggest: { priority:'high', subtasks:['Confirm the deliverable and its owner','Review supporting material and resolve outstanding questions','Prepare the work for manager review'] }
};

function validate(action, result) {
  if (action === 'summary') {
    if (typeof result?.summary !== 'string' || !result.summary.trim() || result.summary.length > 800) throw new Error('Invalid summary');
    return { summary: result.summary.trim() };
  }
  if (!priorityValues.includes(result?.priority) || !Array.isArray(result.subtasks) ||
      result.subtasks.length < 1 || result.subtasks.length > 8 ||
      result.subtasks.some(item => typeof item !== 'string' || !item.trim() || item.length > 240)) {
    throw new Error('Invalid suggestion');
  }
  return { priority:result.priority, subtasks:result.subtasks.map(item => item.trim()) };
}

export async function generate(action, task, comments) {
  const endpoint = process.env.AI_URL;
  if (!endpoint) return demo[action];

  try {
    const response = await fetch(endpoint, {
      method:'POST',
      redirect:'error',
      signal:AbortSignal.timeout(8000),
      headers:{
        'Content-Type':'application/json',
        ...(process.env.AI_KEY ? { Authorization:'Bearer ' + process.env.AI_KEY } : {})
      },
      body:JSON.stringify({
        action,
        task:{ title:task.title, description:task.description },
        ...(action === 'summary' ? { comments:comments.slice(-20).map(({body}) => body) } : {})
      })
    });
    if (!response.ok) throw new Error('AI service error');
    return validate(action,await response.json());
  } catch (error) {
    throw Object.assign(new Error(error.name === 'TimeoutError'
      ? 'The AI service timed out. Try again shortly.'
      : 'The AI service is unavailable. You can continue working on the task.'),{ status:503 });
  }
}
