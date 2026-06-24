# API Endpoint Template

Use when adding a new REST endpoint.

---

## Endpoint Spec

```
Method:  GET | POST | PUT | DELETE
Path:    /api/<resource>[/:id][?param=value]
Auth:    Public | Bearer JWT required | Admin only
```

**Request body:**
```json
{
  "field": "type"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { ... },
  "message": "optional"
}
```

**Error responses:**
| Status | When |
|--------|------|
| 400 | Validation failed |
| 401 | Not authenticated |
| 403 | Not authorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 500 | Internal error |

---

## Implementation Checklist

### DTO (`internal/interfaces/http/dto/xxx_dto.go`)
- [ ] Request struct with `binding:"required"` tags
- [ ] Response struct matching TypeScript `types.ts`

### Handler (`internal/interfaces/http/handler/xxx_handler.go`)
- [ ] `c.ShouldBindJSON(&req)` → `response.BadRequest` on error
- [ ] `middleware.GetUserID(c)` for ownership — never trust body
- [ ] Call service method
- [ ] `response.OK(c, result)` or `response.Created(c, result)`

### Service (`internal/application/xxx/service.go`)
- [ ] Method on `Service` struct
- [ ] Calls repository interface (not concrete implementation)
- [ ] Returns typed entity, not DTO

### Router (`internal/interfaces/http/router.go`)
- [ ] Route added in correct group (public / authed / admin)
- [ ] Correct middleware: `authMW`, `middleware.AdminOnly()` if needed

### Frontend (`src/api/services/xxxService.ts`)
```typescript
getXxx: async (id: number): Promise<XxxDto> => {
  const response = await apiClient.get<ApiResponse<XxxDto>>(`/xxx/${id}`);
  return response.data.data!;
},
```

### Hook (`src/api/hooks/useXxx.ts`)
```typescript
export const useXxx = (id: number) =>
  useQuery({ queryKey: ['xxx', id], queryFn: () => xxxService.getXxx(id) });
```

### Types (`src/api/types.ts`)
- [ ] Request + Response interfaces added
- [ ] No `any` types
