import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Routes to be added in Phase 3 and 6 */}
          <Route path="/" element={<div className="p-8">Welcome to Journaling App</div>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}

export default App
